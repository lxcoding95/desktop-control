// Original local store helper. No network, grants, desktop control or elevation.
using System;
using System.IO;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Runtime.InteropServices;
using System.Text.RegularExpressions;
internal static class BridgeStore {
    static SecurityIdentifier User;
    static readonly SecurityIdentifier SystemSid = new SecurityIdentifier(WellKnownSidType.LocalSystemSid, null);
    [StructLayout(LayoutKind.Sequential)] struct FileInformation {
        public uint Attributes;
        public System.Runtime.InteropServices.ComTypes.FILETIME Creation, Access, Write;
        public uint Volume, SizeHigh, SizeLow, Links, IndexHigh, IndexLow;
    }
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool GetFileInformationByHandle(IntPtr file, out FileInformation information);
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
    static int Number(IntPtr token, int kind) { IntPtr p = Info(token,kind); try { return Marshal.ReadInt32(p); } finally { Marshal.FreeHGlobal(p); } }
    static void Identity() {
        using (WindowsIdentity identity = WindowsIdentity.GetCurrent()) {
            User = identity.User;
            if (!Regex.IsMatch(User.Value, "^S-1-5-21-[0-9]+-[0-9]+-[0-9]+-[0-9]+$") || Number(identity.Token,20) != 0 || Number(identity.Token,26) != 0 || Number(identity.Token,12) <= 0) throw new InvalidOperationException();
            IntPtr label = Info(identity.Token,25);
            try {
                IntPtr sid = Marshal.ReadIntPtr(label); byte count = Marshal.ReadByte(GetSidSubAuthorityCount(sid));
                if (count == 0 || Marshal.ReadInt32(GetSidSubAuthority(sid,(uint)(count-1))) != 0x2000) throw new InvalidOperationException();
            } finally { Marshal.FreeHGlobal(label); }
        }
    }
    static bool Trusted(IdentityReference value) {
        SecurityIdentifier sid = value as SecurityIdentifier;
        return sid != null && (sid.Equals(User) || sid.Equals(SystemSid) || sid.IsWellKnown(WellKnownSidType.BuiltinAdministratorsSid) || sid.Value == "S-1-5-80-956008885-3418522649-1831038044-1853292631-2271478464");
    }
    static void Ancestors(string root) {
        for (string current = Path.GetDirectoryName(root); current != null; current = Path.GetDirectoryName(current)) {
            if ((File.GetAttributes(current) & FileAttributes.ReparsePoint) != 0) throw new InvalidOperationException();
            DirectorySecurity acl = Directory.GetAccessControl(current);
            if (!Trusted(acl.GetOwner(typeof(SecurityIdentifier)))) throw new InvalidOperationException();
            FileSystemRights mutation = FileSystemRights.DeleteSubdirectoriesAndFiles | FileSystemRights.Delete | FileSystemRights.ChangePermissions | FileSystemRights.TakeOwnership | (FileSystemRights)0x10000000;
            foreach (FileSystemAccessRule rule in acl.GetAccessRules(true,true,typeof(SecurityIdentifier)))
                if (rule.AccessControlType == AccessControlType.Allow && (rule.PropagationFlags & PropagationFlags.InheritOnly) == 0 && (rule.FileSystemRights & mutation) != 0 && !Trusted(rule.IdentityReference)) throw new InvalidOperationException();
        }
    }
    static DirectorySecurity Acl() {
        DirectorySecurity acl = new DirectorySecurity(); acl.SetAccessRuleProtection(true,false); acl.SetOwner(User);
        foreach (SecurityIdentifier sid in new SecurityIdentifier[] {User,SystemSid}) acl.AddAccessRule(new FileSystemAccessRule(sid,FileSystemRights.FullControl,InheritanceFlags.ContainerInherit | InheritanceFlags.ObjectInherit,PropagationFlags.None,AccessControlType.Allow));
        return acl;
    }
    static void CheckAcl(FileSystemSecurity acl, bool root) {
        if (!User.Equals(acl.GetOwner(typeof(SecurityIdentifier))) || (root && !acl.AreAccessRulesProtected)) throw new InvalidOperationException();
        bool user=false, system=false;
        foreach (FileSystemAccessRule rule in acl.GetAccessRules(true,true,typeof(SecurityIdentifier))) {
            if (rule.AccessControlType != AccessControlType.Allow || (!User.Equals(rule.IdentityReference) && !SystemSid.Equals(rule.IdentityReference)) || (rule.FileSystemRights & FileSystemRights.FullControl) != FileSystemRights.FullControl) throw new InvalidOperationException();
            if (User.Equals(rule.IdentityReference)) user=true; if (SystemSid.Equals(rule.IdentityReference)) system=true;
        }
        if (!user || !system) throw new InvalidOperationException();
    }
    static int entries;
    static void Tree(string path, bool root) {
        if (++entries > 20000) throw new InvalidOperationException();
        FileAttributes attributes=File.GetAttributes(path);
        if ((attributes & FileAttributes.ReparsePoint) != 0) throw new InvalidOperationException();
        if ((attributes & FileAttributes.Directory) != 0) {
            CheckAcl(Directory.GetAccessControl(path),root);
            foreach(string child in Directory.GetFileSystemEntries(path)) Tree(child,false);
        } else {
            CheckAcl(File.GetAccessControl(path),false);
            // The dedicated lock may be exclusively open by our lock-holder.
            if (Path.GetFileName(path) == "lock") return;
            using(FileStream stream=new FileStream(path,FileMode.Open,FileAccess.Read,FileShare.ReadWrite)) {
                FileInformation information;
                if(!GetFileInformationByHandle(stream.SafeFileHandle.DangerousGetHandle(),out information) || information.Links != 1) throw new InvalidOperationException();
            }
        }
    }
    static int Main(string[] args) {
        try {
            if(args.Length != 2 || (args[0] != "prepare" && args[0] != "check" && args[0] != "lock")) throw new InvalidOperationException();
            Identity(); string root=Path.GetFullPath(args[1]), home=Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
            string production=Path.Combine(home,".desktop-control-private","bridge");
            bool test=String.Equals(Path.GetDirectoryName(root),home,StringComparison.OrdinalIgnoreCase) && Regex.IsMatch(Path.GetFileName(root),"^DesktopControl-bridge-test-[A-Za-z0-9]+$");
            if(!test && !String.Equals(root,production,StringComparison.OrdinalIgnoreCase)) throw new InvalidOperationException();
            // Existing production parents must already satisfy the private-store trust rules.
            if(args[0] == "prepare" && !Directory.Exists(Path.GetDirectoryName(root))) {
                string parent=Path.GetDirectoryName(root); Ancestors(parent); Directory.CreateDirectory(parent,Acl());
            }
            Ancestors(root);
            if(!Directory.Exists(root)) { if(args[0] != "prepare") throw new InvalidOperationException(); Directory.CreateDirectory(root,Acl()); }
            else if(test && args[0] == "prepare" && Directory.GetFileSystemEntries(root).Length == 0) { if((File.GetAttributes(root)&FileAttributes.ReparsePoint)!=0) throw new InvalidOperationException(); Directory.SetAccessControl(root,Acl()); }
            Tree(root,true);
            if(args[0] == "lock") {
                string file=Path.Combine(root,"lock");
                using(FileStream stream=new FileStream(file,FileMode.OpenOrCreate,FileAccess.ReadWrite,FileShare.None)) {
                    FileInformation info; if(!GetFileInformationByHandle(stream.SafeFileHandle.DangerousGetHandle(),out info) || info.Links != 1) throw new InvalidOperationException();
                    Console.WriteLine("LOCKED"); Console.Out.Flush(); while(Console.In.Read() != -1) {}
                }
            }
            return 0;
        } catch { Console.Error.WriteLine("BRIDGE_STORE_DENIED"); return 2; }
    }
}
