import * as z from 'zod/v4';
import type { McpServer } from '@modelcontextprotocol/server';
import type { ChildProcess } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { createPrivateControlAuthority, provisionPrivateControl, provisionPrivateGrant, provisionPrivateWorkspace, stopPrivateControls, privateAccessIsCurrent, beginPrivatePermissionChange, commitPrivatePermissionChange } from './bridge/private-grants.mts';
import type { PrivateControlCapability } from './bridge/private-grants.mts';
import { createControlSequencer } from './bridge/control-sequencer.mts';
import { localPrincipal } from './bridge/principal.mts';
import { createPermissionRequester, permissionRequestSchema } from './permission-request.mts';
import type { PermissionProposal, PermissionRequest } from './permission-request.mts';
import type { PrivateWorkspaceCapability } from './bridge/private-grants.mts';
import type { PermissionQuarantine } from './permission-quarantine.mts';
import { createJournaledPermissionRevoker } from './permission-quarantine.mts';

type Args = Record<string, unknown>;
type Controller = Record<string, (args?: Args) => Promise<unknown>>;
interface BrowserModule { createBrowserController(options: { authorize(capability: PrivateControlCapability): Promise<unknown>; profileDirectory: string; onEmergencyStop(): Promise<void> }): Controller; }
interface DesktopModule { createDesktopController(options: { authorize(capability: PrivateControlCapability): Promise<void>; onEmergencyStop(): Promise<void>; protectedProcessIds: number[]; requestTimeoutMs: number }): Controller; }
interface SettingsModule { openPrivateSettings(): ChildProcess; confirmPrivatePermissionProposal(proposal: PermissionProposal, signal: AbortSignal): Promise<boolean>; confirmPrivateAction(action: { kind: 'desktop.input' | 'browser.interact'; summary: string; details: string }, signal?: AbortSignal): Promise<boolean>; }
const root = fileURLToPath(new URL(import.meta.url.endsWith('.mts') ? '../../../' : '../../../../', import.meta.url));
const safeError = (code: string) => ({ isError: true as const, content: [{ type: 'text' as const, text: code }] });
const png = z.strictObject({ mimeType: z.literal('image/png'), data: z.string().max(6 * 1024 * 1024) });
const desktopPng = png.extend({ width: z.number().int().positive(), height: z.number().int().positive(), x: z.number().int(), y: z.number().int() });
const target = z.union([z.strictObject({ role: z.string().min(1).max(64), name: z.string().max(512) }), z.strictObject({ selector: z.string().min(1).max(512) })]);
const withTarget = <S extends z.ZodRawShape>(extra: S) => z.union([
  z.strictObject({ role: z.string().min(1).max(64), name: z.string().max(512), ...extra }),
  z.strictObject({ selector: z.string().min(1).max(512), ...extra })
]);
const key = z.enum(['Enter', 'Tab', 'Escape', 'Backspace', 'Delete', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown', 'Space']);
const number = z.number().int().min(-131072).max(131072);

/** Validate the complete structured payload; image content is only its pixel projection. */
export function formatPrivateOutput(output: z.ZodType, result: unknown, image = false) {
  const parsed = output.safeParse(result);
  if (!parsed.success) return safeError('INTERNAL_ERROR');
  if (image) {
    const picture = z.object(png.shape).safeParse(parsed.data);
    if (!picture.success) return safeError('INTERNAL_ERROR');
    return { content: [{ type: 'image' as const, mimeType: picture.data.mimeType, data: picture.data.data }], structuredContent: parsed.data as Record<string, unknown> };
  }
  return { content: [{ type: 'text' as const, text: JSON.stringify(parsed.data) }], structuredContent: parsed.data as Record<string, unknown> };
}

/** Private host integration. Local consent never creates or extends a grant. */
export function registerPrivateControls(server: McpServer, dependencies: {
  quarantine: PermissionQuarantine; authority: ReturnType<typeof createPrivateControlAuthority>;
}): () => Promise<void> {
  const { quarantine, authority } = dependencies;
  const sequencer = createControlSequencer();
  let browser: Controller | undefined, desktop: Controller | undefined, settings: ChildProcess | undefined;
  let stopped = false;
  const load = (name: string) => import(pathToFileURL(path.join(root, 'packages', name, 'controller.mjs')).href) as Promise<unknown>;
  const authorize = (capability: PrivateControlCapability) => {
    const access = authority.authorize(capability);
    if (!access || !privateAccessIsCurrent(access)) throw Error('PERMISSION_DENIED');
    return Promise.resolve(access);
  };
  async function stopDesktop() { const current = desktop; desktop = undefined; await current?.stop?.(); }
  async function stopBrowser() { const current = browser; browser = undefined; await current?.stop?.(); }
  async function stopAll() { await Promise.allSettled([stopDesktop(), stopBrowser()]); }
  async function emergencyStop() {
    // Invalidate queued work BEFORE any asynchronous browser/helper shutdown.
    sequencer.interrupt();
    try { revokePermission('controls'); }
    catch { quarantine.quarantine('controls'); } // Every control/terminal adapter shares this latch.
    await stopAll();
  }
  const alive = (signal: AbortSignal) => { if (stopped || signal.aborted) throw Error('CANCELLED'); };
  async function getBrowser(signal: AbortSignal) {
    if (!browser) {
      const access = await authorize('browser.interact');
      const module = await load('private-browser') as BrowserModule;
      alive(signal);
      const accepted = sequencer.current();
      browser = module.createBrowserController({ authorize: capability => {
        if (!sequencer.isCurrent(accepted)) throw Error('CANCELLED');
        return authorize(capability);
      }, profileDirectory: access.profileDirectory,
        onEmergencyStop: emergencyStop });
    }
    return browser;
  }
  async function getDesktop(signal: AbortSignal) {
    if (!desktop) {
      const module = await load('private-desktop') as DesktopModule;
      alive(signal);
      const accepted = sequencer.current();
      desktop = module.createDesktopController({ authorize: async capability => {
        if (!sequencer.isCurrent(accepted)) throw Error('CANCELLED');
        await authorize(capability);
      },
        protectedProcessIds: settings?.pid ? [settings.pid] : [], requestTimeoutMs: 30000,
        onEmergencyStop: emergencyStop });
    }
    return desktop;
  }
  function register(name: string, description: string, input: z.ZodType, output: z.ZodType,
    capability: PrivateControlCapability | null, operation: (args: Args, signal: AbortSignal) => Promise<unknown>, confirmation = false, image = false) {
    const titles: Record<string, string> = { 'desktop_control.open_settings': 'Permissions and versions',
      'desktop_control.stop_control': 'Stop browser and desktop control', 'desktop_control.control_status': 'Version and permission status' };
    server.registerTool(name, { ...(titles[name] ? { title: titles[name] } : {}), description, inputSchema: input, outputSchema: output,
      annotations: { readOnlyHint: !confirmation && capability?.endsWith('.read') === true, destructiveHint: confirmation } }, async (args, ctx) => {
      const bound = Object.freeze({ ...args as Args });
      const urgent = ['desktop_control.stop_control', 'desktop_control.desktop_stop', 'desktop_control.browser_stop', 'desktop_control.open_settings', 'desktop_control.permissions_request', 'desktop_control.permissions_revoke'].includes(name);
      try { return await sequencer.run(ctx.mcpReq.signal, async signal => {
        alive(signal);
        if (capability) await authorize(capability);
        if (confirmation) {
          // Do not permit any automated input while the protected approval UI is open.
          await stopDesktop();
          const module = await load('private-settings') as SettingsModule;
          alive(signal);
          const details = JSON.stringify(bound, null, 2).replace(/[^\x20-\x7e\r\n]/g, character => '\\u' + character.charCodeAt(0).toString(16).padStart(4, '0'));
          if (!await module.confirmPrivateAction({ kind: capability === 'desktop.input' ? 'desktop.input' : 'browser.interact', summary: name, details }, signal))
            return safeError('LOCAL_CONFIRMATION_REQUIRED');
          if (capability) await authorize(capability);
        }
        alive(signal);
        const cancel = () => { void stopAll(); };
        signal.addEventListener('abort', cancel, { once: true });
        let result: unknown;
        try { result = await operation(bound, signal); }
        finally { signal.removeEventListener('abort', cancel); }
        alive(signal);
        return formatPrivateOutput(output, result, image);
      }, urgent);
      } catch (error) {
        return safeError(error instanceof Error && ['CANCELLED', 'PERMISSION_DENIED', 'PERMISSION_RECOVERY_REQUIRED', 'PLATFORM_UNAVAILABLE', 'DESKTOP_STOPPED', 'ELEVATION_REQUIRED', 'PROTECTED_WINDOW'].includes(error.message) ? error.message : 'CONTROL_UNAVAILABLE');
      }
    });
  }
  const empty = z.strictObject({});
  const yes = (field: string) => z.strictObject({ [field]: z.literal(true) });
  const callBrowser = (method: string) => async (args: Args, signal: AbortSignal) => {
    const controller = await getBrowser(signal);
    alive(signal);
    if (!controller[method]) throw Error('CONTROL_UNAVAILABLE');
    return controller[method](args);
  };
  const callDesktop = (method: string) => async (args: Args, signal: AbortSignal) => {
    const controller = await getDesktop(signal);
    alive(signal);
    if (!controller[method]) throw Error('CONTROL_UNAVAILABLE');
    // Consent pauses/closes input. Re-activate only after its fresh host grant check.
    if (method !== 'start' && method !== 'screenshot') await controller.start?.();
    alive(signal);
    return controller[method](args);
  };
  register('desktop_control.control_status', 'Minimal private package and grant state; never returns identity or paths.', empty,
    z.strictObject({ packageVersion: z.string().max(64), platform: z.string(), controls: z.enum(['active', 'denied', 'revoked']), diagnostics: z.enum(['active', 'denied', 'revoked']), workspace: z.enum(['active', 'denied', 'revoked']) }), null, () => {
      const manifest = JSON.parse(readFileSync(path.join(root, existsSync(path.join(root, 'plugin.json')) ? 'plugin.json' : 'plugin/plugin.json'), 'utf8')) as { version?: unknown };
      return Promise.resolve({ packageVersion: typeof manifest.version === 'string' ? manifest.version : 'unknown', platform: process.platform,
        controls: quarantine.isQuarantined('controls') ? 'denied' : provisionPrivateControl('status').state,
        diagnostics: quarantine.isQuarantined('diagnostics') ? 'denied' : provisionPrivateGrant('status').state,
        workspace: quarantine.isQuarantined('workspace') ? 'denied' : provisionPrivateWorkspace('status').state });
    });
  register('desktop_control.open_settings', 'Open the visible local permission window. Stops automation; opening never grants access.', empty, yes('opened'), null, async () => {
    await stopAll();
    if (process.platform !== 'win32') throw Error('PLATFORM_UNAVAILABLE');
    if (settings && settings.exitCode === null) return { opened: true };
    const module = await load('private-settings') as SettingsModule;
    settings = module.openPrivateSettings();
    await new Promise<void>((resolve, reject) => { settings?.once('spawn', resolve); settings?.once('error', () => reject(Error('CONTROL_UNAVAILABLE'))); });
    return { opened: true };
  });
  register('desktop_control.stop_control', 'Stop browser/desktop automation and revoke all control grants. Always available.', empty, yes('stopped'), null, async () => {
    await stopAll(); revokePermission('controls'); return { stopped: true };
  });
  function rawRevokePermission(scope: PermissionRequest['scope']) {
    quarantine.revoke(scope, () => {
      if (scope === 'controls') { stopPrivateControls(); provisionPrivateControl('revoke'); }
      else if (scope === 'workspace') provisionPrivateWorkspace('revoke');
      else provisionPrivateGrant('revoke');
    });
  }
  const revokePermission = createJournaledPermissionRevoker(quarantine, {
    begin: scope => {
      // Another process may already own a permission transaction. Persist Esc
      // before trying that journal, so lock contention never discards the stop.
      if (scope === 'controls') stopPrivateControls();
      return beginPrivatePermissionChange(scope);
    }, revoke: rawRevokePermission, commit: commitPrivatePermissionChange
  });
  const requestPermission = createPermissionRequester({ principal: localPrincipal,
    begin: beginPrivatePermissionChange, commit: commitPrivatePermissionChange,
    confirm: async (proposal, signal) => {
      await stopAll();
      if (settings && settings.exitCode === null) return false;
      const module = await load('private-settings') as SettingsModule;
      return module.confirmPrivatePermissionProposal(proposal, signal);
    },
    apply: request => {
      quarantine.assertGrantAllowed(request.scope);
      if (request.scope === 'controls') provisionPrivateControl('grant', request.capabilities as PrivateControlCapability[], request.allowedOrigins, { reenableStopped: request.reenableStopped });
      else if (request.scope === 'workspace') provisionPrivateWorkspace('grant', request.capabilities as PrivateWorkspaceCapability[]);
      else provisionPrivateGrant('grant');
    }, revoke: rawRevokePermission
  });
  register('desktop_control.permissions_request', 'Request replacement of one local permission group until revoked. Always requires actual human approval in the protected native dialog; a model cannot approve. Other groups remain unchanged.', permissionRequestSchema,
    z.strictObject({ granted: z.boolean() }), null, async (args, signal) => {
      quarantine.assertGrantAllowed((args as PermissionRequest).scope);
      return requestPermission(args, signal);
    });
  register('desktop_control.permissions_revoke', 'Revoke one local permission group without granting any capability. Controls also set the durable emergency stop.',
    z.strictObject({ scope: z.enum(['diagnostics', 'workspace', 'controls']) }), yes('revoked'), null, async args => {
      await stopAll(); revokePermission(args.scope as PermissionRequest['scope']); return { revoked: true };
    });
  register('desktop_control.browser_start', 'Start the separate visible private AI browser; requires local origin grant.', empty, yes('running'), 'browser.interact', callBrowser('start'));
  const tab = z.strictObject({ tabId: z.string().max(32), origin: z.string().max(4096) });
  register('desktop_control.browser_navigate', 'Navigate within an explicitly approved origin; local action confirmation required.', z.strictObject({ url: z.string().max(4096) }), tab, 'browser.interact', callBrowser('navigate'), true);
  register('desktop_control.browser_snapshot', 'Read a bounded accessibility snapshot from the private browser.', empty, z.strictObject({ snapshot: z.string().max(32768), truncated: z.boolean() }), 'browser.read', callBrowser('snapshot'));
  register('desktop_control.browser_click', 'Click a browser element after local confirmation.', target, yes('clicked'), 'browser.interact', callBrowser('click'), true);
  register('desktop_control.browser_fill', 'Fill a browser element after local confirmation; never auto-approve credential/payment/account actions.', withTarget({ value: z.string().max(8192) }), yes('filled'), 'browser.interact', callBrowser('fill'), true);
  register('desktop_control.browser_key', 'Press a bounded browser key after local confirmation.', withTarget({ key }), yes('pressed'), 'browser.interact', callBrowser('press'), true);
  register('desktop_control.browser_scroll', 'Scroll the private browser after local confirmation.', z.strictObject({ deltaY: z.number().int().min(-2000).max(2000) }), yes('scrolled'), 'browser.interact', callBrowser('scroll'), true);
  register('desktop_control.browser_screenshot', 'Read a bounded private-browser PNG; may contain sensitive page content.', empty, png, 'browser.read', callBrowser('screenshot'), false, true);
  register('desktop_control.browser_tabs', 'List private browser tab IDs/origins.', empty, z.strictObject({ tabs: z.array(z.strictObject({ tabId: z.string().max(32), origin: z.string().max(4096), active: z.boolean() })).max(8) }), 'browser.read', callBrowser('tabs'));
  register('desktop_control.browser_new_tab', 'Open an approved-origin private tab after local confirmation.', z.strictObject({ url: z.string().max(4096) }), tab, 'browser.interact', callBrowser('newTab'), true);
  register('desktop_control.browser_select_tab', 'Select a private browser tab.', z.strictObject({ tabId: z.string().max(32) }), z.strictObject({ tabId: z.string().max(32), active: z.literal(true) }), 'browser.interact', callBrowser('selectTab'));
  register('desktop_control.browser_close_tab', 'Close a private browser tab after local confirmation.', z.strictObject({ tabId: z.string().max(32) }), yes('closed'), 'browser.interact', callBrowser('closeTab'), true);
  register('desktop_control.browser_stop', 'Stop the private browser, including after grant revocation.', empty, yes('stopped'), null, async () => { await stopBrowser(); return { stopped: true }; });
  register('desktop_control.desktop_start', 'Start visible high-trust Windows desktop input: black cursor/banner, Esc stop. Requires local confirmation.', empty, yes('active'), 'desktop.input', callDesktop('start'), true);
  register('desktop_control.desktop_screenshot', 'Read desktop pixels under explicit host permission; may contain sensitive content.', empty, desktopPng, 'desktop.read', callDesktop('screenshot'), false, true);
  register('desktop_control.desktop_move', 'Move the real Windows mouse after local confirmation; affects the interactive session.', z.strictObject({ x: number, y: number }), yes('moved'), 'desktop.input', callDesktop('move'), true);
  register('desktop_control.desktop_click', 'Click the Windows desktop after local confirmation; protected/elevated targets denied.', z.strictObject({ button: z.enum(['left', 'right', 'middle']).optional(), x: number.optional(), y: number.optional() }), yes('clicked'), 'desktop.input', callDesktop('click'), true);
  register('desktop_control.desktop_key', 'Press a bounded Windows key after local confirmation.', z.strictObject({ key: key.exclude(['Escape', 'Space']) }), yes('pressed'), 'desktop.input', callDesktop('key'), true);
  register('desktop_control.desktop_type', 'Type bounded text after local confirmation; fresh grant checks between chunks.', z.strictObject({ text: z.string().max(8192) }), yes('typed'), 'desktop.input', callDesktop('typeText'), true);
  register('desktop_control.desktop_stop', 'Stop desktop control and revoke the control policy; no approval needed.', empty, yes('stopped'), null, async () => {
    await stopDesktop(); revokePermission('controls'); return { stopped: true };
  });
  return async () => { stopped = true; sequencer.interrupt(); await stopAll(); settings?.kill(); };
}
