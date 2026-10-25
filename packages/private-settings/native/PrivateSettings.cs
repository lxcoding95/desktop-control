// Local, visible host permission UI. It never exposes a network endpoint or an MCP grant tool.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Runtime.InteropServices;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;

internal sealed class PrivateSettings : Form {
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
    [DllImport("advapi32.dll", SetLastError=true)] static extern bool OpenProcessToken(IntPtr process, uint access, out IntPtr token);
    [DllImport("advapi32.dll", SetLastError=true)] static extern bool GetTokenInformation(IntPtr token, int kind, IntPtr data, int length, out int needed);
    [DllImport("advapi32.dll")] static extern IntPtr GetSidSubAuthorityCount(IntPtr sid);
    [DllImport("advapi32.dll")] static extern IntPtr GetSidSubAuthority(IntPtr sid, uint index);
    static IntPtr Info(IntPtr token, int kind) {
        int size; GetTokenInformation(token, kind, IntPtr.Zero, 0, out size);
        if (size <= 0 || size > 65536) throw new InvalidOperationException();
        IntPtr value = Marshal.AllocHGlobal(size);
        if (!GetTokenInformation(token, kind, value, size, out size)) { Marshal.FreeHGlobal(value); throw new InvalidOperationException(); }
        return value;
    }
    static int Number(IntPtr token, int kind) {
        IntPtr value = Info(token, kind);
        try { return Marshal.ReadInt32(value); } finally { Marshal.FreeHGlobal(value); }
    }
    static bool NormalInteractiveUser() {
        IntPtr token = IntPtr.Zero;
        try {
            using (Process process = Process.GetCurrentProcess()) {
                if (!Environment.UserInteractive || process.SessionId <= 0 || !OpenProcessToken(process.Handle, 8, out token)) return false;
            }
            if (Number(token, 20) != 0 || Number(token, 26) != 0) return false;
            IntPtr label = Info(token, 25);
            try {
                IntPtr sid = Marshal.ReadIntPtr(label); byte count = Marshal.ReadByte(GetSidSubAuthorityCount(sid));
                return count > 0 && Marshal.ReadInt32(GetSidSubAuthority(sid, (uint)(count - 1))) == 8192;
            } finally { Marshal.FreeHGlobal(label); }
        } finally { if (token != IntPtr.Zero) CloseHandle(token); }
    }
    static readonly string[] Capabilities = { "browser.read", "browser.interact", "desktop.read", "desktop.input", "terminal.exec" };
    readonly string Node, Cli;
    readonly JavaScriptSerializer Json = new JavaScriptSerializer { MaxJsonLength = 32768 };
    readonly CheckedListBox Checks = new CheckedListBox();
    readonly TextBox Origins = new TextBox();
    readonly TextBox Status = new TextBox();
    readonly FlowLayoutPanel Buttons = new FlowLayoutPanel();
    bool Busy;

    static string PackageVersion(string cli) {
        try {
            string root = new DirectoryInfo(Path.GetDirectoryName(cli)).Parent.Parent.Parent.FullName;
            string manifest = Path.Combine(root, "plugin.json");
            if (!File.Exists(manifest)) manifest = Path.Combine(root, "plugin", "plugin.json");
            var file = new FileInfo(manifest);
            if (!file.Exists || file.Length > 16384) return "unknown";
            var data = new JavaScriptSerializer { MaxJsonLength = 16384, RecursionLimit = 12 }.DeserializeObject(File.ReadAllText(manifest)) as Dictionary<string, object>;
            string version = data != null && data.ContainsKey("version") ? data["version"] as string : null;
            return version != null && Regex.IsMatch(version, @"\A[0-9]{1,8}\.[0-9]{1,8}\.[0-9]{1,8}(?:-[A-Za-z0-9.-]{1,80})?\z") ? version : "unknown";
        } catch { return "unknown"; }
    }
    static string VersionDetails(string cli) {
        return "Desktop Control - Anon Allman" + Environment.NewLine +
            "Plugin P: " + PackageVersion(cli) + Environment.NewLine +
            "Bridge B: packaged runtime; independent active version not yet reported" + Environment.NewLine +
            "Automatic Bridge updates: not active in this build" + Environment.NewLine +
            "Account upload, installed plugin and running bridge are separate states. Opening settings changes no rights.";
    }

    PrivateSettings(string node, string cli) {
        Node = node; Cli = cli;
        Text = "Desktop Control — Settings";
        AccessibleName = "Desktop Control local permission settings";
        StartPosition = FormStartPosition.CenterScreen; MinimumSize = new Size(680, 680); Size = new Size(760, 740);
        AutoScaleMode = AutoScaleMode.Dpi;
        var layout = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 1, RowCount = 9, Padding = new Padding(18) };
        layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 125));
        layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 90));
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 110));
        layout.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        layout.Controls.Add(new Label { Text = "Desktop Control · Anon Allman", AutoSize = true, Font = new Font(Font, FontStyle.Bold) });
        layout.Controls.Add(new Label { Text = "Plugin P: " + PackageVersion(cli) + " · Automatic Bridge updates: not active", AutoSize = true, MaximumSize = new Size(690, 0), AccessibleName = "Installed plugin and update status" });
        layout.Controls.Add(new Label { Text = "Grant only capabilities you intend to allow. Grants remain until revoked. Desktop access can read and control your interactive session; Esc stops desktop access. Terminal is isolated in the separately approved workspace.", AutoSize = true, MaximumSize = new Size(690, 0) });
        Checks.Dock = DockStyle.Fill; Checks.CheckOnClick = true; Checks.AccessibleName = "Requested capabilities"; Checks.Items.AddRange(Capabilities); layout.Controls.Add(Checks);
        layout.Controls.Add(new Label { Text = "Browser: exact allowed HTTP(S) origins, one per line (example: https://example.com). No wildcard or account-specific permission is implemented.", AutoSize = true, MaximumSize = new Size(690, 0) });
        Origins.Multiline = true; Origins.ScrollBars = ScrollBars.Vertical; Origins.Dock = DockStyle.Fill; Origins.MaxLength = 10240; Origins.AccessibleName = "Allowed browser origins"; layout.Controls.Add(Origins);
        Buttons.Dock = DockStyle.Fill; Buttons.WrapContents = true;
        AddButton("Refresh status", "status", null);
        AddButton("Versions & updates", "versions", null);
        AddButton("Grant selected controls / re-enable desktop", "control-grant", null);
        AddButton("Revoke ALL controls", "control-revoke", null);
        AddButton("Grant diagnostics", "grant", null); AddButton("Revoke diagnostics", "revoke", null);
        AddButton("Grant workspace files/PDF", "workspace-grant", null); AddButton("Revoke workspace", "workspace-revoke", null);
        layout.Controls.Add(Buttons);
        Status.Multiline = true; Status.ReadOnly = true; Status.Dock = DockStyle.Fill; Status.ScrollBars = ScrollBars.Vertical; Status.AccessibleName = "Protected local permission status"; layout.Controls.Add(Status);
        layout.Controls.Add(new Label { Text = "No rights are changed until you click Grant/Revoke. Opening this window never approves an MCP request. Esc stops desktop control. Account controls and Linux GUI are not implemented here.", AutoSize = true, MaximumSize = new Size(690, 0) });
        Controls.Add(layout);
        Shown += async delegate { await RefreshStatus(); };
    }
    void AddButton(string title, string action, object unused) {
        var button = new Button { Text = title, AutoSize = true, Margin = new Padding(3), AccessibleName = title };
        button.Click += async delegate {
            if (Busy) return;
            if (action == "status") { await RefreshStatus(); return; }
            if (action == "versions") { Status.Text = VersionDetails(Cli); return; }
            string payload = null;
            if (action == "control-grant") {
                var selected = new List<string>(); foreach (object item in Checks.CheckedItems) selected.Add((string)item);
                var origins = new List<string>(); foreach (string line in Origins.Lines) if (line.Trim().Length > 0) origins.Add(line.Trim());
                payload = Json.Serialize(new Dictionary<string, object> { {"capabilities", selected}, {"allowedOrigins", origins}, {"reenableStopped", true} });
                if (MessageBox.Show(this, "Enable the selected high-trust capabilities until revoked? This replaces the previous control selection. Explicit re-enable clears the durable Esc stop for the selected browser/desktop controls.", "Confirm local permission", MessageBoxButtons.OKCancel, MessageBoxIcon.Warning, MessageBoxDefaultButton.Button2) != DialogResult.OK) return;
            }
            else if (action.EndsWith("grant", StringComparison.Ordinal) && MessageBox.Show(this, "Enable this permission until revoked?", "Confirm local permission", MessageBoxButtons.OKCancel, MessageBoxIcon.Warning, MessageBoxDefaultButton.Button2) != DialogResult.OK) return;
            Busy = true; Buttons.Enabled = false;
            try { Status.Text = await Run(action, payload); }
            catch { Status.Text = "PRIVATE_POLICY_UNAVAILABLE"; }
            finally { Busy = false; Buttons.Enabled = true; }
        };
        Buttons.Controls.Add(button);
    }
    static string Quote(string value) { return "\"" + value.Replace("\"", "\\\"") + "\""; }
    Task<string> Run(string action, string payload) {
        return Task.Run(delegate {
            var start = new ProcessStartInfo(Node, Quote(Cli) + " " + action) { UseShellExecute = false, CreateNoWindow = true, RedirectStandardInput = true, RedirectStandardOutput = true, RedirectStandardError = true };
            using (var process = Process.Start(start)) {
                if (payload != null) process.StandardInput.Write(payload); process.StandardInput.Close();
                Task<string> output = process.StandardOutput.ReadToEndAsync(); Task<string> error = process.StandardError.ReadToEndAsync();
                if (!process.WaitForExit(15000)) { try { process.Kill(); } catch { } throw new InvalidOperationException(); }
                Task.WaitAll(output, error);
                if (process.ExitCode != 0 || output.Result.Length > 16384) return "PRIVATE_POLICY_UNAVAILABLE";
                return action + Environment.NewLine + output.Result;
            }
        });
    }
    async Task RefreshStatus() {
        if (Busy) return; Busy = true; Buttons.Enabled = false;
        try { Status.Text = await Run("status", null) + Environment.NewLine + await Run("workspace-status", null) + Environment.NewLine + await Run("control-status", null); }
        catch { Status.Text = "PRIVATE_POLICY_UNAVAILABLE"; }
        finally { Busy = false; Buttons.Enabled = true; }
    }
    static bool ExactKeys(Dictionary<string, object> value, params string[] keys) {
        if (value == null || value.Count != keys.Length) return false;
        foreach (string key in keys) if (!value.ContainsKey(key)) return false;
        return true;
    }
    static bool CapabilityList(object input, string[] allowed, int maximum, out object[] items) {
        items = input as object[];
        if (items == null || items.Length > maximum) return false;
        var seen = new HashSet<string>(StringComparer.Ordinal);
        foreach (object item in items) {
            string capability = item as string;
            if (capability == null || Array.IndexOf(allowed, capability) < 0 || !seen.Add(capability)) return false;
        }
        return true;
    }
    static readonly string[] WorkspaceCapabilities = { "files.read", "files.write", "files.remove", "pdf.create" };
    static bool ValidPermissionDetails(string details) {
        if (String.IsNullOrEmpty(details) || details.Length > 8192) return false;
        foreach (char c in details) if ((c < 32 && c != '\r' && c != '\n') || c > 126) return false;
        try {
            var parser = new JavaScriptSerializer { MaxJsonLength = 8192, RecursionLimit = 8 };
            var proposal = parser.DeserializeObject(details) as Dictionary<string, object>;
            if (!ExactKeys(proposal, "controls", "allowedOrigins", "diagnostics", "workspaceCapabilities", "reenableStopped", "lifetime") ||
                !(proposal["diagnostics"] is bool) || !(proposal["reenableStopped"] is bool)) return false;
            object[] selected, workspace;
            if (!CapabilityList(proposal["controls"], Capabilities, 5, out selected) ||
                !CapabilityList(proposal["workspaceCapabilities"], WorkspaceCapabilities, 4, out workspace)) return false;
            var lifetime = proposal["lifetime"] as Dictionary<string, object>;
            if (!ExactKeys(lifetime, "kind") || lifetime["kind"] as string != "until-revoked") return false;
            var origins = proposal["allowedOrigins"] as object[];
            if (origins == null || origins.Length > 20) return false;
            var seen = new HashSet<string>(StringComparer.Ordinal);
            foreach (object item in origins) {
                string origin = item as string; Uri uri;
                if (String.IsNullOrEmpty(origin) || origin.Length > 512 || !seen.Add(origin) ||
                    !Uri.TryCreate(origin, UriKind.Absolute, out uri) || (uri.Scheme != "http" && uri.Scheme != "https") ||
                    uri.UserInfo.Length != 0 || uri.Host.Length == 0 || uri.GetLeftPart(UriPartial.Authority) != origin) return false;
            }
            foreach (string capability in selected) if (capability.StartsWith("browser.", StringComparison.Ordinal) && origins.Length == 0) return false;
            return true;
        } catch { return false; }
    }
    static int PermissionContract() {
        Console.WriteLine(new JavaScriptSerializer().Serialize(new Dictionary<string, object> {
            {"kind", "permissions.grant"}, {"controls", Capabilities}, {"workspaceCapabilities", WorkspaceCapabilities},
            {"lifetime", "until-revoked"}, {"defaultDecision", "deny"}, {"maximumBytes", 8192}, {"timeoutMs", 60000}, {"grantsWritten", false}
        })); return 0;
    }
    static int ConfirmAction() {
        var input = new System.Text.StringBuilder();
        for (int c; (c = Console.In.Read()) != -1;) {
            input.Append((char)c);
            if (input.Length > 140000) return 2;
        }
        var parser = new JavaScriptSerializer { MaxJsonLength = 140000, RecursionLimit = 8 };
        var value = parser.DeserializeObject(input.ToString()) as Dictionary<string, object>;
        if (value == null || value.Count != 3 || !value.ContainsKey("kind") || !value.ContainsKey("summary") || !value.ContainsKey("details")) return 2;
        string kind = value["kind"] as string, summary = value["summary"] as string, details = value["details"] as string;
        bool permissions = kind == "permissions.grant";
        if ((!permissions && kind != "desktop.input" && kind != "browser.interact") || String.IsNullOrWhiteSpace(summary) || summary.Length > 240) return 2;
        foreach (char c in summary) if (Char.IsControl(c) || (c >= 0x202a && c <= 0x202e) || (c >= 0x2066 && c <= 0x2069)) return 2;
        if (String.IsNullOrEmpty(details) || details.Length > 65536) return 2;
        foreach (char c in details) if ((c < 32 && c != '\r' && c != '\n') || c > 126) return 2;
        if (permissions && (summary != "Persistent Desktop Control permissions: until revoked" || !ValidPermissionDetails(details))) return 2;
        using (Form prompt = new Form { Text=permissions ? "Desktop Control permission approval" : "Desktop Control action approval", Width=800, Height=600, MinimumSize=new Size(650,450), StartPosition=FormStartPosition.CenterScreen, TopMost=true }) {
            var layout = new TableLayoutPanel { Dock=DockStyle.Fill, RowCount=3, ColumnCount=1, Padding=new Padding(16) };
            layout.RowStyles.Add(new RowStyle(SizeType.AutoSize)); layout.RowStyles.Add(new RowStyle(SizeType.Percent,100)); layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
            layout.Controls.Add(new Label { Text=permissions
                ? "Approve persistent permissions UNTIL REVOKED. Inspect every control, exact origin, diagnostics flag and file/PDF capability below. reenableStopped=true explicitly clears the durable stop for selected controls. Cancel denies this proposal."
                : "Approve ONE action only: " + summary + "\r\nInspect the exact bound arguments below. This never grants future actions.", AutoSize=true, MaximumSize=new Size(740,0) });
            layout.Controls.Add(new TextBox { Text=details, Multiline=true, ReadOnly=true, ScrollBars=ScrollBars.Both, WordWrap=false, Dock=DockStyle.Fill, Font=new Font(FontFamily.GenericMonospace,10), AccessibleName=permissions ? "Exact permission proposal until revoked" : "Exact action arguments" });
            var buttons=new FlowLayoutPanel { Dock=DockStyle.Fill, AutoSize=true, FlowDirection=FlowDirection.RightToLeft };
            var cancel=new Button { Text="Cancel", DialogResult=DialogResult.Cancel, AutoSize=true };
            var approve=new Button { Text=permissions ? "Approve these permissions until revoked" : "Approve this action", DialogResult=DialogResult.OK, AutoSize=true };
            buttons.Controls.Add(cancel); buttons.Controls.Add(approve); layout.Controls.Add(buttons); prompt.Controls.Add(layout);
            prompt.CancelButton=cancel; prompt.AcceptButton=cancel;
            using (var deadline = new System.Windows.Forms.Timer { Interval=60000 }) {
                deadline.Tick += delegate { prompt.DialogResult=DialogResult.Cancel; prompt.Close(); };
                prompt.Shown += delegate { cancel.Focus(); deadline.Start(); };
                return prompt.ShowDialog() == DialogResult.OK ? 0 : 3;
            }
        }
    }
    [STAThread] static int Main(string[] args) {
        try {
            if (!NormalInteractiveUser()) return 2;
            if (args.Length == 1 && args[0] == "--probe") return 0;
            if (args.Length == 1 && args[0] == "--permission-contract") return PermissionContract();
            if (args.Length == 2 && args[0] == "--info" && Path.IsPathRooted(args[1]) && File.Exists(args[1])) {
                Console.WriteLine(VersionDetails(args[1])); return 0;
            }
            if (args.Length == 1 && args[0] == "--confirm-action") {
                Application.EnableVisualStyles(); Application.SetCompatibleTextRenderingDefault(false);
                return ConfirmAction();
            }
            if (args.Length != 2 || !Path.IsPathRooted(args[0]) || !Path.IsPathRooted(args[1]) || !File.Exists(args[0]) || !File.Exists(args[1])) return 2;
            Application.EnableVisualStyles(); Application.SetCompatibleTextRenderingDefault(false); Application.Run(new PrivateSettings(args[0], args[1])); return 0;
        } catch { return 2; }
    }
}
