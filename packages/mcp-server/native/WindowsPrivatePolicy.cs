// PRIVATE preview policy: DPAPI CurrentUser, fixed user profile path, protected ACLs.
// Arbitrary code running as this same account remains inside the trusted boundary.
using System;
using System.IO;
using System.Text;
using System.Security.AccessControl;
using System.Security.Cryptography;
using System.Security.Principal;
internal static class WindowsPrivatePolicy {
    const int Limit = 16384;
    static readonly byte[] Entropy = Encoding.UTF8.GetBytes("desktop-control/private-diagnostics/policy/v1");
    static readonly SecurityIdentifier SystemSid = new SecurityIdentifier(WellKnownSidType.LocalSystemSid, null);
    static SecurityIdentifier UserSid;
    static void CheckAncestors(string path) {
        string current = Path.GetFullPath(path);
        while (!String.IsNullOrEmpty(current)) {
            CheckPath(current);
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
    static int Main(string[] args) {
        try {
            if (args.Length == 1 && args[0] == "probe") { Console.WriteLine("PRIVATE_POLICY_V1"); return 0; }
            if (args.Length != 1 && args.Length != 3) throw new InvalidOperationException();
            if (args[0] != "read" && args[0] != "write") throw new InvalidOperationException();
            using (WindowsIdentity identity = WindowsIdentity.GetCurrent()) { UserSid = identity.User; }
            string profile = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
            if (String.IsNullOrEmpty(profile)) throw new InvalidOperationException();
            CheckAncestors(profile);
            string directory = Path.Combine(profile, ".desktop-control-private");
            bool test = args.Length == 3;
            if (test) {
                if (args[1] != "--test-directory") throw new InvalidOperationException();
                directory = Path.GetFullPath(args[2]);
                string parent = Path.GetFullPath(Path.GetTempPath()).TrimEnd(Path.DirectorySeparatorChar);
                if (!String.Equals(Path.GetDirectoryName(directory), parent, StringComparison.OrdinalIgnoreCase) ||
                    !System.Text.RegularExpressions.Regex.IsMatch(Path.GetFileName(directory), "^DesktopControl-private-test-[A-Za-z0-9]+$")) throw new InvalidOperationException();
                CheckAncestors(parent);
            }
            // The explicit test directory starts as a fresh mkdtemp directory; protect it
            // on first write only. Production existing directories are never repaired.
            if (!Directory.Exists(directory)) {
                if (args[0] != "write") throw new InvalidOperationException();
                Directory.CreateDirectory(directory, DirectoryAcl());
            } else if (test && args[0] == "write" && Directory.GetFileSystemEntries(directory).Length == 0) {
                CheckPath(directory); Directory.SetAccessControl(directory, DirectoryAcl());
            }
            CheckPath(directory); CheckAcl(Directory.GetAccessControl(directory));
            string file = Path.Combine(directory, "policy");
            if (File.Exists(file)) { CheckPath(file); CheckAcl(File.GetAccessControl(file)); }
            if (args[0] == "read") {
                using (FileStream stream = new FileStream(file, FileMode.Open, FileAccess.Read, FileShare.Read)) {
                    if (stream.Length <= 0 || stream.Length > 32768) throw new InvalidOperationException();
                    byte[] cipher = new byte[(int)stream.Length];
                    int offset = 0;
                    while (offset < cipher.Length) { int n = stream.Read(cipher, offset, cipher.Length - offset); if (n <= 0) throw new InvalidOperationException(); offset += n; }
                    byte[] plain = ProtectedData.Unprotect(cipher, Entropy, DataProtectionScope.CurrentUser);
                    if (plain.Length > Limit) throw new InvalidOperationException();
                    Console.Write(Encoding.UTF8.GetString(plain));
                }
            } else {
                byte[] cipher = ProtectedData.Protect(Encoding.UTF8.GetBytes(Input()), Entropy, DataProtectionScope.CurrentUser);
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
