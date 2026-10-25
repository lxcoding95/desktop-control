import * as z from 'zod/v4';
import { createServer } from './server.mts';
import { createPrivateGrantStore, createPrivateWorkspaceAuthority, createPrivateControlAuthority } from './bridge/private-grants.mts';
import { createWorkspaceExecutor } from './bridge/workspace.mts';
import type { PrivateWorkspaceCapability } from './bridge/private-grants.mts';
import { registerPrivateControls } from './private-controls.mts';

const relative = z.string().min(1).max(512);
const sha = z.string().regex(/^[0-9a-f]{64}$/);
const encoding = z.enum(['utf8', 'base64']);
const code = z.enum(['INVALID_INPUT', 'PATH_NOT_ALLOWED', 'NOT_FOUND', 'CONFLICT', 'LIMIT_EXCEEDED', 'INTERNAL_ERROR', 'PERMISSION_DENIED', 'CANCELLED', 'BUSY', 'TIMEOUT', 'SANDBOX_UNAVAILABLE', 'SANDBOX_CLEANUP_FAILED', 'PROCESS_UNAVAILABLE']);
const written = { path: relative, bytes: z.number().int().min(0).max(1048576), sha256: sha };

/** Private capabilities are independently host-authorized; the normal S02 factory is unchanged. */
export function createPrivateServer() {
  const server = createServer({ grants: createPrivateGrantStore() });
  const workspaceAuthority = createPrivateWorkspaceAuthority();
  const controls = createPrivateControlAuthority();
  const execute = createWorkspaceExecutor(workspaceAuthority);
  const terminal = createWorkspaceExecutor({ authorize(capability) {
    const control = controls.authorize('terminal.exec');
    const workspace = workspaceAuthority.authorize(capability);
    return control && workspace ? { ...workspace, expiresAt: Math.min(control.expiresAt, workspace.expiresAt) } : null;
  } });
  function register<Input extends z.ZodRawShape, Output extends z.ZodRawShape>(
    name: string, op: string, capabilities: readonly PrivateWorkspaceCapability[], input: Input, output: Output, readOnly: boolean,
    executor = execute
  ) {
    const success = z.strictObject({ ok: z.literal(true), ...output });
    const failed = z.strictObject({ ok: z.literal(false), error: z.strictObject({ code }) });
    server.registerTool(name, {
      description: `Private workspace ${op}; requires local ${capabilities.join(' + ')}. Files stay in the explicitly approved isolated workspace.`,
      inputSchema: z.strictObject(input), outputSchema: success,
      annotations: { readOnlyHint: readOnly, destructiveHint: !readOnly }
    }, async (args, ctx) => {
      const result = await executor(capabilities, { ...args, op }, ctx.mcpReq.signal);
      const failure = failed.safeParse(result);
      if (failure.success) return { isError: true, content: [{ type: 'text' as const, text: failure.data.error.code }] };
      const parsed = success.safeParse(result);
      if (!parsed.success) return { isError: true, content: [{ type: 'text' as const, text: 'INTERNAL_ERROR' }] };
      return { content: [{ type: 'text' as const, text: JSON.stringify(parsed.data) }], structuredContent: parsed.data };
    });
  }
  register('desktop_control.files_list', 'list', ['files.read'], { path: relative.optional() },
    { path: z.string().max(512), entries: z.array(z.strictObject({ name: relative, type: z.enum(['file', 'directory']), bytes: z.number().int().nonnegative().optional() })).max(200) }, true);
  register('desktop_control.files_read', 'read', ['files.read'], { path: relative, encoding: encoding.optional() },
    { ...written, encoding, data: z.string().max(2 * 1048576) }, true);
  register('desktop_control.files_write', 'write', ['files.write'], { path: relative, data: z.string().max(2 * 1048576), encoding: encoding.optional(), expectedSha256: sha.optional() }, written, false);
  register('desktop_control.files_mkdir', 'mkdir', ['files.write'], { path: relative, recursive: z.boolean().optional() }, { path: relative }, false);
  register('desktop_control.files_remove', 'remove', ['files.remove'], { path: relative, expectedSha256: sha }, { token: z.string().uuid() }, false);
  register('desktop_control.files_restore', 'restore', ['files.write', 'files.remove'], { token: z.string().uuid() }, written, false);
  register('desktop_control.pdf_create', 'pdf', ['files.write', 'pdf.create'], { path: relative, text: z.string().max(32768), expectedSha256: sha.optional() }, written, false);
  register('desktop_control.terminal_run', 'terminal', ['files.write'], {
    argv: z.tuple([z.enum(['node', 'npm', 'git', 'sh'])]).rest(z.string().max(32768)).refine(args => args.length <= 64)
  }, { exitCode: z.number().int(), stdout: z.string().max(65536), stderr: z.string().max(65536) }, false, terminal);
  const stopControls = registerPrivateControls(server);
  const close = server.close.bind(server);
  server.close = async () => { await stopControls(); await close(); };
  return server;
}
