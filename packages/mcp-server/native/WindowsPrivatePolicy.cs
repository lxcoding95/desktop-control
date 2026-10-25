// PRIVATE preview policy: DPAPI CurrentUser, fixed user profile path, protected ACLs.
// Arbitrary code running as this same account remains inside the trusted boundary.
using System;
using System.IO;
using System.Text;
using System.Security.AccessControl;
using System.Security.Cryptography;
using System.Security.Principal;
using System.Runtime.InteropServices;
internal static class WindowsPrivatePolicy {
    [StructLayout(LayoutKind.Sequential)] struct FileInformation {
        public uint Attributes;
        public System.Runtime.InteropServices.ComTypes.FILETIME Creation, Access, Write;
        public uint Volume, SizeHigh, SizeLow, Links, IndexHigh, IndexLow;
    }
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool GetFileInformationByHandle(IntPtr file, out FileInformation information);
    const int Limit = 16384;
    static readonly byte[] Entropy = Encoding.UTF8.GetBytes("desktop-control/private-diagnostics/policy/v1");
    static readonly byte[] WorkspaceEntropy = Encoding.UTF8.GetBytes("desktop-control/private-workspace/policy/v1");
    static readonly byte[] ControlEntropy = Encoding.UTF8.GetBytes("desktop-control/private-control/policy/v1");
    static readonly SecurityIdentifier SystemSid = new SecurityIdentifier(WellKnownSidType.LocalSystemSid, null);
    static SecurityIdentifier UserSid;
    static bool TrustedAncestorIdentity(IdentityReference identity) {
        SecurityIdentifier sid = identity as SecurityIdentifier;
        return sid != null && (sid.Equals(UserSid) || sid.Equals(SystemSid) ||
            sid.IsWellKnown(WellKnownSidType.BuiltinAdministratorsSid) ||
            sid.Value == "S-1-5-80-956008885-3418522649-1831038044-1853292631-2271478464"); // TrustedInstaller
    }
    static void CheckAncestorAcl(string path) {
        DirectorySecurity acl = Directory.GetAccessControl(path);
        if (!TrustedAncestorIdentity(acl.GetOwner(typeof(SecurityIdentifier)))) throw new InvalidOperationException();
        FileSystemRights mutation = FileSystemRights.DeleteSubdirectoriesAndFiles | FileSystemRights.Delete |
            FileSystemRights.ChangePermissions | FileSystemRights.TakeOwnership | (FileSystemRights)0x10000000; // GENERIC_ALL
        foreach (FileSystemAccessRule rule in acl.GetAccessRules(true, true, typeof(SecurityIdentifier))) {
            // An inherit-only ACE is not effective on this directory. Protected private
            // store ACLs also prevent it becoming effective on policy children.
            if (rule.AccessControlType == AccessControlType.Allow &&
                (rule.PropagationFlags & PropagationFlags.InheritOnly) == 0 &&
                (rule.FileSystemRights & mutation) != 0 && !TrustedAncestorIdentity(rule.IdentityReference))
                throw new InvalidOperationException();
        }
    }
    static void CheckAncestors(string path) {
        string current = Path.GetFullPath(path);
        while (!String.IsNullOrEmpty(current)) {
            CheckPath(current);
            CheckAncestorAcl(current);
            DirectoryInfo parent = Directory.GetParent(current);
            if (parent == null) break;
            current = parent.FullName;
        }
    }
    static void CheckPath(string path) {
        if ((File.GetAttributes(path) & FileAttributes.ReparsePoint) != 0) throw new InvalidOperationException();
    }
    static void CheckAcl(FileSystemSecurity acl) {
        if (!acl.AreAccessRulesProtected || !UserSid.Equals(acl.GetOwner(typeof(SecurityIdentifier)))) throw new InvalidOperationException();
        bool user = false, system = false;
        foreach (FileSystemAccessRule rule in acl.GetAccessRules(true, true, typeof(SecurityIdentifier))) {
            if (rule.IsInherited || rule.AccessControlType != AccessControlType.Allow ||
                (!UserSid.Equals(rule.IdentityReference) && !SystemSid.Equals(rule.IdentityReference))) throw new InvalidOperationException();
            if ((rule.FileSystemRights & FileSystemRights.FullControl) != FileSystemRights.FullControl) throw new InvalidOperationException();
            if (UserSid.Equals(rule.IdentityReference)) user = true;
            if (SystemSid.Equals(rule.IdentityReference)) system = true;
        }
        if (!user || !system) throw new InvalidOperationException();
    }
    static DirectorySecurity DirectoryAcl() {
        DirectorySecurity acl = new DirectorySecurity();
        acl.SetAccessRuleProtection(true, false); acl.SetOwner(UserSid);
        foreach (SecurityIdentifier sid in new SecurityIdentifier[] { UserSid, SystemSid })
            acl.AddAccessRule(new FileSystemAccessRule(sid, FileSystemRights.FullControl,
                InheritanceFlags.ContainerInherit | InheritanceFlags.ObjectInherit, PropagationFlags.None, AccessControlType.Allow));
        return acl;
    }
    static FileSecurity FileAcl() {
        FileSecurity acl = new FileSecurity();
        acl.SetAccessRuleProtection(true, false); acl.SetOwner(UserSid);
        foreach (SecurityIdentifier sid in new SecurityIdentifier[] { UserSid, SystemSid })
            acl.AddAccessRule(new FileSystemAccessRule(sid, FileSystemRights.FullControl, AccessControlType.Allow));
        return acl;
    }
    static string Input() {
        StringBuilder result = new StringBuilder();
        for (int c; (c = Console.In.Read()) != -1;) {
            result.Append((char)c);
            if (result.Length > Limit) throw new InvalidOperationException();
        }
        string value = result.ToString();
        if (Encoding.UTF8.GetByteCount(value) > Limit) throw new InvalidOperationException();
        return value;
    }
    static void WorkspaceLock(string directory, bool prepare) {
        string file = Path.Combine(directory, "workspace-lock");
        if (!File.Exists(file)) {
            if (!prepare) throw new InvalidOperationException();
            byte[] content = Encoding.ASCII.GetBytes("LOCK_V1");
            using (FileStream stream = new FileStream(file, FileMode.CreateNew, FileSystemRights.Write, FileShare.None, 4096, FileOptions.WriteThrough, FileAcl())) {
                stream.Write(content, 0, content.Length); stream.Flush(true);
            }
        }
        CheckPath(file); CheckAcl(File.GetAccessControl(file));
        using (FileStream stream = new FileStream(file, FileMode.Open, FileAccess.Read, FileShare.ReadWrite)) {
            FileInformation information;
            if (!GetFileInformationByHandle(stream.SafeFileHandle.DangerousGetHandle(), out information) || information.Links != 1 || stream.Length != 7) throw new InvalidOperationException();
            byte[] content = new byte[7];
            if (stream.Read(content, 0, 7) != 7 || Encoding.ASCII.GetString(content) != "LOCK_V1") throw new InvalidOperationException();
        }
    }
    static int Main(string[] args) {
        try {
            if (args.Length == 1 && args[0] == "probe") { Console.WriteLine("PRIVATE_POLICY_V1"); return 0; }
            if (args.Length != 1 && args.Length != 3) throw new InvalidOperationException();
            bool workspace = args[0] == "read-workspace" || args[0] == "write-workspace" || args[0] == "prepare-workspace";
            bool control = args[0] == "read-control" || args[0] == "write-control" || args[0] == "prepare-browser" || args[0] == "clear-desktop-stop" || args[0] == "prepare-browser-runtime" || args[0] == "validate-browser-runtime";
            bool writing = args[0] == "write" || args[0] == "write-workspace" || args[0] == "prepare-workspace" || args[0] == "write-control" || args[0] == "prepare-browser" || args[0] == "clear-desktop-stop" || args[0] == "prepare-browser-runtime";
            if (!workspace && !control && args[0] != "read" && args[0] != "write") throw new InvalidOperationException();
            using (WindowsIdentity identity = WindowsIdentity.GetCurrent()) { UserSid = identity.User; }
            string profile = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
            if (String.IsNullOrEmpty(profile)) throw new InvalidOperationException();
            CheckAncestors(profile);
            string directory = Path.Combine(profile, ".desktop-control-private");
            bool test = args.Length == 3;
            if (test) {
                if (args[1] != "--test-directory") throw new InvalidOperationException();
                directory = Path.GetFullPath(args[2]);
                string parent = Path.GetFullPath(profile).TrimEnd(Path.DirectorySeparatorChar);
                string testRoot = Path.GetFileName(directory) == "policy-store" ? Path.GetDirectoryName(directory) : directory;
                if (!String.Equals(Path.GetDirectoryName(testRoot), parent, StringComparison.OrdinalIgnoreCase) ||
                    !System.Text.RegularExpressions.Regex.IsMatch(Path.GetFileName(testRoot), "^DesktopControl-private-test-[A-Za-z0-9]+$")) throw new InvalidOperationException();
                CheckAncestors(Path.GetDirectoryName(directory));
                if (directory != testRoot && writing && Directory.GetFileSystemEntries(testRoot).Length == 0)
                    Directory.SetAccessControl(testRoot, DirectoryAcl());
            }
            // The explicit test directory starts as a fresh mkdtemp directory; protect it
            // on first write only. Production existing directories are never repaired.
            if (!Directory.Exists(directory)) {
                if (!writing) throw new InvalidOperationException();
                Directory.CreateDirectory(directory, DirectoryAcl());
            } else if (test && writing && Directory.GetFileSystemEntries(directory).Length == 0) {
                CheckPath(directory); Directory.SetAccessControl(directory, DirectoryAcl());
            }
            CheckPath(directory); CheckAcl(Directory.GetAccessControl(directory));
            if (args[0] == "prepare-browser-runtime" || args[0] == "validate-browser-runtime") {
                string runtime = Path.Combine(directory, "browser-runtime");
                if (!Directory.Exists(runtime)) {
                    if (args[0] != "prepare-browser-runtime") throw new InvalidOperationException();
                    Directory.CreateDirectory(runtime, DirectoryAcl());
                }
                CheckPath(runtime); CheckAcl(Directory.GetAccessControl(runtime));
                return 0;
            }
            if (args[0] == "clear-desktop-stop") {
                string sentinel = Path.Combine(directory, "desktop-stop");
                if (File.Exists(sentinel)) { CheckPath(sentinel); File.Delete(sentinel); }
                return 0;
            }
            if (args[0] == "prepare-browser") {
                string browser = Path.Combine(directory, "browser-profile");
                if (!Directory.Exists(browser)) Directory.CreateDirectory(browser, DirectoryAcl());
                CheckPath(browser); CheckAcl(Directory.GetAccessControl(browser));
                return 0;
            }
            if (args[0] == "read-control") {
                string browser = Path.Combine(directory, "browser-profile");
                if (!Directory.Exists(browser)) throw new InvalidOperationException();
                CheckPath(browser); CheckAcl(Directory.GetAccessControl(browser));
            }
            if (args[0] == "prepare-workspace" || args[0] == "read-workspace") {
                string workArea = Path.Combine(directory, "workspace");
                if (!Directory.Exists(workArea)) {
                    if (args[0] != "prepare-workspace") throw new InvalidOperationException();
                    Directory.CreateDirectory(workArea, DirectoryAcl());
                }
                CheckPath(workArea); CheckAcl(Directory.GetAccessControl(workArea));
                WorkspaceLock(directory, args[0] == "prepare-workspace");
                if (args[0] == "prepare-workspace") return 0;
            }
            byte[] entropy = workspace ? WorkspaceEntropy : control ? ControlEntropy : Entropy;
            string file = Path.Combine(directory, workspace ? "workspace-policy" : control ? "control-policy" : "policy");
            if (File.Exists(file)) { CheckPath(file); CheckAcl(File.GetAccessControl(file)); }
            if (!writing) {
                using (FileStream stream = new FileStream(file, FileMode.Open, FileAccess.Read, FileShare.Read)) {
                    if (stream.Length <= 0 || stream.Length > 32768) throw new InvalidOperationException();
                    byte[] cipher = new byte[(int)stream.Length];
                    int offset = 0;
                    while (offset < cipher.Length) { int n = stream.Read(cipher, offset, cipher.Length - offset); if (n <= 0) throw new InvalidOperationException(); offset += n; }
                    byte[] plain = ProtectedData.Unprotect(cipher, entropy, DataProtectionScope.CurrentUser);
                    if (plain.Length > Limit) throw new InvalidOperationException();
                    Console.Write(Encoding.UTF8.GetString(plain));
                }
            } else {
                byte[] cipher = ProtectedData.Protect(Encoding.UTF8.GetBytes(Input()), entropy, DataProtectionScope.CurrentUser);
                string temporary = Path.Combine(directory, ".policy-" + Guid.NewGuid().ToString("N"));
                try {
                    using (FileStream stream = new FileStream(temporary, FileMode.CreateNew, FileSystemRights.Write, FileShare.None, 4096, FileOptions.WriteThrough, FileAcl())) {
                        stream.Write(cipher, 0, cipher.Length); stream.Flush(true);
                    }
                    if (File.Exists(file)) File.Replace(temporary, file, null); else File.Move(temporary, file);
                    CheckPath(file); CheckAcl(File.GetAccessControl(file));
                } finally { if (File.Exists(temporary)) File.Delete(temporary); }
            }
            return 0;
        } catch { Console.Error.WriteLine("PRIVATE_POLICY_UNAVAILABLE"); return 2; }
    }
}
