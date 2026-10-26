// Read-only Windows process-token query; no grant enrollment, shell or network.
using System;
using System.Runtime.InteropServices;
using System.Security.Principal;
internal static class WindowsToken {
    [DllImport("kernel32.dll", SetLastError=true)] static extern IntPtr OpenProcess(uint access, bool inherit, int pid);
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
    [DllImport("advapi32.dll", SetLastError=true)] static extern bool OpenProcessToken(IntPtr process, uint access, out IntPtr token);
    [DllImport("advapi32.dll", SetLastError=true)] static extern bool GetTokenInformation(IntPtr token, int kind, IntPtr data, int length, out int needed);
    [DllImport("advapi32.dll")] static extern IntPtr GetSidSubAuthorityCount(IntPtr sid);
    [DllImport("advapi32.dll")] static extern IntPtr GetSidSubAuthority(IntPtr sid, uint index);
    static IntPtr Info(IntPtr token, int kind) {
        int size; GetTokenInformation(token, kind, IntPtr.Zero, 0, out size);
        if (size <= 0 || size > 65536) throw new InvalidOperationException();
        IntPtr value = Marshal.AllocHGlobal(size);
        if (!GetTokenInformation(token, kind, value, size, out size)) {
            Marshal.FreeHGlobal(value); throw new InvalidOperationException();
        }
        return value;
    }
    static int Number(IntPtr token, int kind) {
        IntPtr value = Info(token, kind);
        try { return Marshal.ReadInt32(value); } finally { Marshal.FreeHGlobal(value); }
    }
    static int Main(string[] args) {
        IntPtr process = IntPtr.Zero, token = IntPtr.Zero;
        try {
            int pid;
            if (args.Length != 1 || !Int32.TryParse(args[0], out pid) || pid <= 0) throw new InvalidOperationException();
            process = OpenProcess(0x1000, false, pid); // PROCESS_QUERY_LIMITED_INFORMATION
            if (process == IntPtr.Zero || !OpenProcessToken(process, 0x0008, out token)) throw new InvalidOperationException(); // TOKEN_QUERY
            string sid;
            using (WindowsIdentity identity = new WindowsIdentity(token)) { sid = identity.User.Value; }
            IntPtr label = Info(token, 25); // TokenIntegrityLevel
            int integrity;
            try {
                IntPtr labelSid = Marshal.ReadIntPtr(label);
                byte count = Marshal.ReadByte(GetSidSubAuthorityCount(labelSid));
                if (count == 0) throw new InvalidOperationException();
                integrity = Marshal.ReadInt32(GetSidSubAuthority(labelSid, (uint)(count - 1)));
            } finally { Marshal.FreeHGlobal(label); }
            bool elevated = Number(token, 20) != 0, uiAccess = Number(token, 26) != 0;
            int session = Number(token, 12);
            Console.WriteLine("{\"pid\":" + pid + ",\"sid\":\"" + sid + "\",\"elevated\":" +
                (elevated ? "true" : "false") + ",\"uiAccess\":" + (uiAccess ? "true" : "false") +
                ",\"integrity\":" + integrity + ",\"session\":" + session + "}");
            return 0;
        } catch { Console.Error.WriteLine("IDENTITY_UNAVAILABLE"); return 2; }
        finally { if (token != IntPtr.Zero) CloseHandle(token); if (process != IntPtr.Zero) CloseHandle(process); }
    }
}
