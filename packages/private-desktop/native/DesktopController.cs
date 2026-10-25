using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Imaging;
using System.Drawing.Drawing2D;
using System.IO;
using System.Runtime.InteropServices;
using System.Security.Principal;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Forms;

// Original private-preview helper. No shell, arbitrary process launch, or path RPC.
internal sealed class ControlBanner : Form {
  protected override bool ShowWithoutActivation { get { return true; } }
  protected override CreateParams CreateParams {
    get { CreateParams parameters=base.CreateParams; parameters.ExStyle|=0x08000000|0x00000080; return parameters; }
  }
}

// Original indicator surface: one tiny, click-through, nonactivating layered window per edge.
internal sealed class ControlEdge : Form {
  internal readonly int Side;
  [StructLayout(LayoutKind.Sequential)] struct NativePoint {public int X,Y;public NativePoint(int x,int y){X=x;Y=y;}}
  [StructLayout(LayoutKind.Sequential)] struct NativeSize {public int Width,Height;public NativeSize(int width,int height){Width=width;Height=height;}}
  [StructLayout(LayoutKind.Sequential,Pack=1)] struct Blend {public byte Operation,Flags,Alpha,Format;}
  [DllImport("user32.dll")] static extern IntPtr GetDC(IntPtr window);
  [DllImport("user32.dll")] static extern int ReleaseDC(IntPtr window,IntPtr dc);
  [DllImport("gdi32.dll")] static extern IntPtr CreateCompatibleDC(IntPtr dc);
  [DllImport("gdi32.dll")] static extern bool DeleteDC(IntPtr dc);
  [DllImport("gdi32.dll")] static extern IntPtr SelectObject(IntPtr dc,IntPtr value);
  [DllImport("gdi32.dll")] static extern bool DeleteObject(IntPtr value);
  [DllImport("user32.dll",SetLastError=true)] static extern bool UpdateLayeredWindow(IntPtr window,IntPtr screen,ref NativePoint location,ref NativeSize size,IntPtr surface,ref NativePoint origin,uint colorKey,ref Blend blend,uint flags);
  internal ControlEdge(Rectangle bounds,int side) {
    if(side<0 || side>3) throw new Exception("INDICATOR_GEOMETRY_FAILED");
    Side=side;FormBorderStyle=FormBorderStyle.None;TopMost=true;ShowInTaskbar=false;
    StartPosition=FormStartPosition.Manual;AutoScaleMode=AutoScaleMode.None;Bounds=bounds;
    Text="Desktop Control edge "+side;SetStyle(ControlStyles.Selectable,false);
  }
  protected override bool ShowWithoutActivation {get{return true;}}
  protected override CreateParams CreateParams {
    get {CreateParams value=base.CreateParams;value.ExStyle|=0x080800A0;return value;}
  }
  protected override void WndProc(ref Message message) {
    if(message.Msg==0x84) {message.Result=new IntPtr(-1);return;} // HTTRANSPARENT
    if(message.Msg==0x21) {message.Result=new IntPtr(3);return;} // MA_NOACTIVATE
    base.WndProc(ref message);
  }
  internal static int Thickness(uint dpi) {
    if(dpi<48 || dpi>960) throw new Exception("INDICATOR_DPI_UNAVAILABLE");
    return Math.Max(4,Math.Min(12,(int)Math.Round(6.0*dpi/96.0)));
  }
  internal static Rectangle[] Geometry(Rectangle screen,uint dpi) {
    if(screen.Width<4 || screen.Height<4 || screen.Width>131072 || screen.Height>131072) throw new Exception("INDICATOR_GEOMETRY_FAILED");
    int thickness=Math.Min(Thickness(dpi),Math.Min(screen.Width,screen.Height)/4);
    return new[]{new Rectangle(screen.Left,screen.Top,screen.Width,thickness),
      new Rectangle(screen.Left,screen.Bottom-thickness,screen.Width,thickness),
      new Rectangle(screen.Left,screen.Top+thickness,thickness,screen.Height-2*thickness),
      new Rectangle(screen.Right-thickness,screen.Top+thickness,thickness,screen.Height-2*thickness)};
  }
  internal static Bitmap Surface(int width,int height,int side) {
    if(side<0 || side>3 || width<=0 || height<=0 || width>131072 || height>131072 || (long)width*height>1572864) throw new Exception("INDICATOR_GEOMETRY_FAILED");
    Bitmap result=new Bitmap(width,height,PixelFormat.Format32bppPArgb);
    try {
      using(Graphics graphics=Graphics.FromImage(result)) {
        graphics.CompositingMode=CompositingMode.SourceCopy;
        int thickness=side<2?height:width;
        for(int distance=0;distance<thickness;distance++) {
          double fade=1.0-distance/(double)Math.Max(1,thickness-1);
          using(SolidBrush brush=new SolidBrush(Color.FromArgb((int)Math.Round(96*fade*fade),35,134,255))) {
            if(side<2) graphics.FillRectangle(brush,0,side==0?distance:height-1-distance,width,1);
            else graphics.FillRectangle(brush,side==2?distance:width-1-distance,0,1,height);
          }
        }
      }
      return result;
    } catch {result.Dispose();throw;}
  }
  internal void PaintSurface() {
    using(Bitmap bitmap=Surface(Width,Height,Side)) {
      IntPtr screen=GetDC(IntPtr.Zero),memory=IntPtr.Zero,image=IntPtr.Zero,previous=IntPtr.Zero;
      try {
        if(screen==IntPtr.Zero || (memory=CreateCompatibleDC(screen))==IntPtr.Zero) throw new Exception("INDICATOR_RENDER_FAILED");
        image=bitmap.GetHbitmap(Color.FromArgb(0));previous=SelectObject(memory,image);
        if(image==IntPtr.Zero || previous==IntPtr.Zero || previous==new IntPtr(-1)) throw new Exception("INDICATOR_RENDER_FAILED");
        NativePoint location=new NativePoint(Left,Top),origin=new NativePoint(0,0);NativeSize size=new NativeSize(Width,Height);
        Blend blend=new Blend{Operation=0,Flags=0,Alpha=255,Format=1};
        if(!UpdateLayeredWindow(Handle,screen,ref location,ref size,memory,ref origin,0,ref blend,2)) throw new Exception("INDICATOR_RENDER_FAILED");
      } finally {
        if(previous!=IntPtr.Zero && previous!=new IntPtr(-1) && memory!=IntPtr.Zero) SelectObject(memory,previous);
        if(image!=IntPtr.Zero) DeleteObject(image);if(memory!=IntPtr.Zero) DeleteDC(memory);if(screen!=IntPtr.Zero) ReleaseDC(IntPtr.Zero,screen);
      }
    }
  }
}

internal static class DesktopController {
  const uint SPI_SETCURSORS = 0x0057;
  static readonly string StopFile = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".desktop-control-private", "desktop-stop");
  static readonly JavaScriptSerializer Json = new JavaScriptSerializer { MaxJsonLength = 6 * 1024 * 1024 };
  static readonly HashSet<int> Protected = new HashSet<int>();
  static readonly object OutputLock = new object();
  static Form Banner;
  static readonly List<ControlEdge> Edges=new List<ControlEdge>();
  static bool DisplayChangeSubscribed;
  static readonly EventHandler DisplayChanging=(sender,args)=>{
    if(!Active) return;
    EmergencyTransition(PersistEmergency,ReportEmergency,
      cleanup=>Banner.BeginInvoke(cleanup),()=>{Stop(false);Application.Exit();},
      ()=>{try {RestoreCursor();} finally {Environment.Exit(2);}});
  };
  static volatile bool Active, Stopping, EmergencyLatched;
  static int EmergencyReported;
  static IntPtr Hook;
  static HookProc HookCallback = KeyboardHook;
  static Process Watchdog;
  static bool CursorTouched;
  // SetSystemCursor's documented IDs; obsolete OCR_SIZE/OCR_ICON are not accepted.
  static readonly uint[] SystemCursorIds={32512,32513,32514,32515,32516,32642,32643,32644,32645,32646,32648,32649,32650};
  static uint LastCursorFailureId;
  static int LastCursorFailureError;
  [StructLayout(LayoutKind.Sequential)] struct Point { public int X,Y; public Point(int x,int y) {X=x;Y=y;} }
  [StructLayout(LayoutKind.Sequential)] struct INPUT { public uint type; public InputUnion u; }
  [StructLayout(LayoutKind.Explicit)] struct InputUnion { [FieldOffset(0)] public MOUSEINPUT mouse; [FieldOffset(0)] public KEYBDINPUT key; }
  [StructLayout(LayoutKind.Sequential)] struct MOUSEINPUT { public int dx,dy; public uint mouseData,dwFlags,time; public UIntPtr extra; }
  [StructLayout(LayoutKind.Sequential)] struct KEYBDINPUT { public ushort vk,scan; public uint flags,time; public UIntPtr extra; }
  delegate IntPtr HookProc(int code, IntPtr message, IntPtr data);
  [DllImport("user32.dll",SetLastError=true)] static extern bool SetProcessDpiAwarenessContext(IntPtr context);
  [DllImport("user32.dll")] static extern uint GetDpiForWindow(IntPtr window);
  [DllImport("user32.dll")] static extern uint SendInput(uint count, INPUT[] inputs,int size);
  [DllImport("user32.dll")] static extern IntPtr SetWindowsHookEx(int id,HookProc proc,IntPtr module,uint thread);
  [DllImport("user32.dll")] static extern bool UnhookWindowsHookEx(IntPtr hook);
  [DllImport("user32.dll")] static extern IntPtr CallNextHookEx(IntPtr hook,int code,IntPtr message,IntPtr data);
  [DllImport("kernel32.dll")] static extern IntPtr GetModuleHandle(string name);
  [DllImport("user32.dll")] static extern bool SystemParametersInfo(uint action,uint param,IntPtr data,uint flags);
  [DllImport("user32.dll",SetLastError=true)] static extern IntPtr CreateCursor(IntPtr instance,int hotX,int hotY,int width,int height,byte[] andMask,byte[] xorMask);
  [DllImport("user32.dll",SetLastError=true)] static extern bool SetSystemCursor(IntPtr cursor,uint id);
  [DllImport("user32.dll")] static extern bool DestroyCursor(IntPtr cursor);
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern IntPtr WindowFromPoint(Point point);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr window,out uint pid);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetClassName(IntPtr window,StringBuilder name,int count);
  [DllImport("user32.dll")] static extern IntPtr GetAncestor(IntPtr window,uint flags);
  [DllImport("user32.dll")] static extern bool GetCursorPos(out Point point);
  [DllImport("user32.dll")] static extern IntPtr OpenInputDesktop(uint flags,bool inherit,uint access);
  [DllImport("user32.dll")] static extern bool CloseDesktop(IntPtr desktop);
  [DllImport("advapi32.dll",SetLastError=true)] static extern bool GetTokenInformation(IntPtr token,int type,IntPtr data,int size,out int needed);
  [DllImport("advapi32.dll")] static extern IntPtr GetSidSubAuthority(IntPtr sid,uint index);
  [DllImport("advapi32.dll")] static extern IntPtr GetSidSubAuthorityCount(IntPtr sid);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
  [DllImport("advapi32.dll",SetLastError=true)] static extern bool OpenProcessToken(IntPtr process,uint access,out IntPtr token);
  static void Emit(object value) { lock(OutputLock) Console.WriteLine(Json.Serialize(value)); }
  static int Integrity(IntPtr token) {
    int size; GetTokenInformation(token,25,IntPtr.Zero,0,out size);
    if(size<=0 || size>65536) throw new Exception("TOKEN_UNAVAILABLE");
    IntPtr buffer=Marshal.AllocHGlobal(size);
    try { if(!GetTokenInformation(token,25,buffer,size,out size)) throw new Exception("TOKEN_UNAVAILABLE");
      IntPtr sid=Marshal.ReadIntPtr(buffer); byte count=Marshal.ReadByte(GetSidSubAuthorityCount(sid));
      return Marshal.ReadInt32(GetSidSubAuthority(sid,(uint)(count-1)));
    } finally {Marshal.FreeHGlobal(buffer);}
  }
  static void CheckEnvironment() {
    if(!Environment.UserInteractive || Process.GetCurrentProcess().SessionId==0) throw new Exception("INTERACTIVE_REQUIRED");
    using(WindowsIdentity identity=WindowsIdentity.GetCurrent()) if(Integrity(identity.Token)!=8192) throw new Exception("MEDIUM_INTEGRITY_REQUIRED");
    IntPtr desktop=OpenInputDesktop(0,false,1); if(desktop==IntPtr.Zero) throw new Exception("SECURE_DESKTOP_DENIED"); CloseDesktop(desktop);
  }
  static void CheckTarget(IntPtr window) {
    CheckEnvironment(); if(window==IntPtr.Zero) throw new Exception("TARGET_UNAVAILABLE");
    uint pid; GetWindowThreadProcessId(window,out pid);
    if(pid==Process.GetCurrentProcess().Id || Protected.Contains((int)pid)) throw new Exception("PROTECTED_WINDOW");
    IntPtr root=GetAncestor(window,2); StringBuilder name=new StringBuilder(256); GetClassName(root,name,256);
    if(name.ToString().StartsWith("DesktopControlPrivateSettings",StringComparison.Ordinal)) throw new Exception("PROTECTED_WINDOW");
    try { using(Process target=Process.GetProcessById((int)pid)) { if(target.ProcessName.Equals("private-settings",StringComparison.OrdinalIgnoreCase)) throw new Exception("PROTECTED_WINDOW"); IntPtr token; if(!OpenProcessToken(target.Handle,8,out token)) throw new Exception("TARGET_UNAVAILABLE");
      try {if(Integrity(token)>8192) throw new Exception("ELEVATION_REQUIRED");} finally{CloseHandle(token);} }
    } catch(Exception ex) {if(ex.Message=="ELEVATION_REQUIRED" || ex.Message=="PROTECTED_WINDOW") throw; throw new Exception("TARGET_UNAVAILABLE");}
  }
  static void RequireActive() { if(Stopping || EmergencyLatched || File.Exists(StopFile)) throw new Exception("DESKTOP_STOPPED"); if(!Active) throw new Exception("DESKTOP_NOT_ACTIVE"); }
  static INPUT[] ReleaseInputs(INPUT[] inputs) {
    List<INPUT> releases=new List<INPUT>();
    foreach(INPUT input in inputs) {
      if(input.type==1 && (input.u.key.flags&2)==0) {INPUT release=input;release.u.key.flags|=2;releases.Add(release);}
      if(input.type==0) {uint down=input.u.mouse.dwFlags&(2u|8u|32u);if(down!=0) releases.Add(Mouse(down*2,0,0));}
    }
    return releases.ToArray();
  }
  static void Send(INPUT[] inputs) {
    RequireActive();
    if(SendInput((uint)inputs.Length,inputs,Marshal.SizeOf(typeof(INPUT)))!=inputs.Length) {
      // Windows may accept only part of a batch. Best-effort release before terminal stop.
      INPUT[] releases=ReleaseInputs(inputs);if(releases.Length>0) SendInput((uint)releases.Length,releases,Marshal.SizeOf(typeof(INPUT)));
      Stop(true); Banner.BeginInvoke((Action)(()=>Application.Exit())); throw new Exception("INPUT_FAILED");
    }
  }
  static INPUT KeyInput(ushort vk,ushort scan,uint flags) {return new INPUT {type=1,u=new InputUnion {key=new KEYBDINPUT {vk=vk,scan=scan,flags=flags}}};}
  static INPUT Mouse(uint flags,int x,int y) {return new INPUT {type=0,u=new InputUnion {mouse=new MOUSEINPUT {dwFlags=flags,dx=x,dy=y}}};}
  static INPUT MoveInput(int x,int y) {
    Rectangle bounds=SystemInformation.VirtualScreen;
    if(!bounds.Contains(x,y)) throw new Exception("INVALID_COORDINATES"); CheckTarget(WindowFromPoint(new Point(x,y)));
    return Mouse(0x8000|0x4000|1,(int)((long)(x-bounds.Left)*65535/Math.Max(1,bounds.Width-1)),(int)((long)(y-bounds.Top)*65535/Math.Max(1,bounds.Height-1)));
  }
  static void RestoreCursor() {SystemParametersInfo(SPI_SETCURSORS,0,IntPtr.Zero,0);}
  static void ApplyBlackCursors(Func<IntPtr> create,Func<IntPtr,uint,bool> replace,Action restore,Action<IntPtr> destroy,Func<int> lastError) {
    LastCursorFailureId=0;LastCursorFailureError=0;
    try {
      foreach(uint id in SystemCursorIds) {
        IntPtr cursor=create();
        if(cursor==IntPtr.Zero) {LastCursorFailureId=id;LastCursorFailureError=lastError();throw new Exception("CURSOR_FAILED");}
        bool consumed=false;
        try {
          if(!replace(cursor,id)) {LastCursorFailureId=id;LastCursorFailureError=lastError();throw new Exception("CURSOR_FAILED");}
          // Successful SetSystemCursor consumes the created handle. Never destroy it twice.
          consumed=true;
        } finally {if(!consumed) destroy(cursor);}
      }
    } catch {restore();throw;}
  }
  static void BlackCursor() {
    byte[] andMask=new byte[128],xorMask=new byte[128]; for(int i=0;i<andMask.Length;i++) andMask[i]=255;
    for(int y=0;y<23;y++) for(int x=0;x<=Math.Min(y/2,10);x++) andMask[y*4+x/8]&=(byte)~(128>>(x%8));
    CursorTouched=true;
    ApplyBlackCursors(()=>CreateCursor(IntPtr.Zero,0,0,32,32,andMask,xorMask),SetSystemCursor,
      ()=>{RestoreCursor();CursorTouched=false;},cursor=>{DestroyCursor(cursor);},Marshal.GetLastWin32Error);
  }
  static void StartResources(Action watch,Func<IntPtr> installHook,Action cursor,Action show,Action cleanup) {
    try {watch();Hook=installHook();if(Hook==IntPtr.Zero) throw new Exception("EMERGENCY_HOOK_FAILED");cursor();Active=true;show();}
    catch {cleanup();throw;}
  }
  static void StartWatchdog() {
    string name="Local\\DesktopControlCursor-"+Guid.NewGuid().ToString("N");
    using(EventWaitHandle ready=new EventWaitHandle(false,EventResetMode.ManualReset,name)) {
      ProcessStartInfo info=new ProcessStartInfo(Process.GetCurrentProcess().MainModule.FileName,"--watchdog "+Process.GetCurrentProcess().Id+" "+name);
      info.UseShellExecute=false; info.CreateNoWindow=true; info.RedirectStandardOutput=true; info.RedirectStandardError=true;
      Watchdog=Process.Start(info); if(!ready.WaitOne(5000) || Watchdog.HasExited) throw new Exception("WATCHDOG_UNAVAILABLE");
    }
  }
  static void ShowIndicators() {
    Screen[] screens=Screen.AllScreens;
    if(screens.Length<1 || screens.Length>16) throw new Exception("INDICATOR_GEOMETRY_FAILED");
    foreach(Screen screen in screens) {
      uint dpi;
      using(ControlEdge probe=new ControlEdge(new Rectangle(screen.Bounds.Left,screen.Bounds.Top,1,1),0)) dpi=GetDpiForWindow(probe.Handle);
      Rectangle[] bounds=ControlEdge.Geometry(screen.Bounds,dpi);
      for(int side=0;side<4;side++) {
        ControlEdge edge=new ControlEdge(bounds[side],side);Edges.Add(edge);
        edge.PaintSurface();edge.Show();
      }
    }
    Microsoft.Win32.SystemEvents.DisplaySettingsChanging+=DisplayChanging;DisplayChangeSubscribed=true;
    Banner.Show();
  }
  static void CloseIndicators() {
    if(DisplayChangeSubscribed) {Microsoft.Win32.SystemEvents.DisplaySettingsChanging-=DisplayChanging;DisplayChangeSubscribed=false;}
    foreach(ControlEdge edge in Edges) {try {edge.Hide();edge.Dispose();} catch { /* Continue restoring every other owned surface. */ }}
    Edges.Clear();
  }
  static void PersistEmergency() {try {File.WriteAllText(StopFile,"STOPPED\n");} catch { /* In-memory latch and process shutdown still refuse input. */ }}
  static void ReportEmergency() {if(Interlocked.Exchange(ref EmergencyReported,1)==0) Emit(new {@event="emergencyStop"});}
  static void EmergencyTransition(Action persist,Action notify,Action<Action> marshal,Action cleanup,Action shutdown) {
    // A display event can run off the UI thread: close input BEFORE persistence or marshalling.
    EmergencyLatched=true;Active=false;
    try {persist();} catch { /* Shutdown/deny does not depend on a healthy filesystem. */ }
    try {notify();} catch { /* Closed stdout cannot keep native input alive. */ }
    try {marshal(cleanup);} catch {shutdown();}
  }
  static void Stop(bool emergency) {
    if(Stopping) return; Stopping=true; Active=false;
    if(emergency) {EmergencyLatched=true;PersistEmergency();ReportEmergency();}
    // Each admitted SendInput batch pairs all downs/ups; no key/button remains held between calls.
    if(Hook!=IntPtr.Zero) {UnhookWindowsHookEx(Hook);Hook=IntPtr.Zero;}
    if(CursorTouched) {RestoreCursor();CursorTouched=false;} CloseIndicators();if(Banner!=null) Banner.Hide();
  }
  static IntPtr KeyboardHook(int code,IntPtr message,IntPtr data) {
    if(code>=0 && Active && Marshal.ReadInt32(data)==27 && (message==(IntPtr)0x100 || message==(IntPtr)0x104)) {
      Stop(true); Banner.BeginInvoke((Action)(()=>Application.Exit())); return (IntPtr)1;
    }
    return CallNextHookEx(Hook,code,message,data);
  }
  static int Integer(Dictionary<string,object> request,string key) {object value; if(!request.TryGetValue(key,out value) || !(value is int)) throw new Exception("INVALID_ARGUMENT"); return (int)value;}
  static string Text(Dictionary<string,object> request,string key) {object value; if(!request.TryGetValue(key,out value) || !(value is string)) throw new Exception("INVALID_ARGUMENT"); return (string)value;}
  static object Execute(Dictionary<string,object> request) {
    string action=Text(request,"action");
    if(action=="stop") {Stop(false); Banner.BeginInvoke((Action)(()=>Application.Exit())); return new { stopped=true };}
    if(Stopping || EmergencyLatched || File.Exists(StopFile)) throw new Exception("DESKTOP_STOPPED");
    if(action=="start") {
      if(Active) return new {active=true}; CheckEnvironment();
      // Require host to have prepared the fixed, ACL-protected directory; never self-provision.
      if(!Directory.Exists(Path.GetDirectoryName(StopFile))) throw new Exception("HOST_POLICY_REQUIRED");
      StartResources(StartWatchdog,()=>SetWindowsHookEx(13,HookCallback,GetModuleHandle(null),0),BlackCursor,ShowIndicators,
        ()=>{Stop(false);Banner.BeginInvoke((Action)(()=>Application.Exit()));});
      return new {active=true};
    }
    if(action=="screenshot") {
      CheckEnvironment(); Rectangle bounds=SystemInformation.VirtualScreen;
      if(bounds.Width<=0 || bounds.Height<=0 || (long)bounds.Width*bounds.Height>32000000) throw new Exception("SCREEN_TOO_LARGE");
      using(Bitmap bitmap=new Bitmap(bounds.Width,bounds.Height)) using(Graphics graphics=Graphics.FromImage(bitmap)) using(MemoryStream stream=new MemoryStream()) {
        graphics.CopyFromScreen(bounds.Location,System.Drawing.Point.Empty,bounds.Size); bitmap.Save(stream,ImageFormat.Png);
        if(stream.Length>4194304) throw new Exception("SCREENSHOT_TOO_LARGE"); return new {mimeType="image/png",data=Convert.ToBase64String(stream.ToArray()),width=bounds.Width,height=bounds.Height,x=bounds.X,y=bounds.Y};
      }
    }
    RequireActive();
    if(action=="move") {Send(new[]{MoveInput(Integer(request,"x"),Integer(request,"y"))});return new {moved=true};}
    if(action=="click") {
      List<INPUT> inputs=new List<INPUT>();
      if(request.ContainsKey("x") || request.ContainsKey("y")) inputs.Add(MoveInput(Integer(request,"x"),Integer(request,"y")));
      else {Point point; if(!GetCursorPos(out point)) throw new Exception("TARGET_UNAVAILABLE"); CheckTarget(WindowFromPoint(point));}
      string button=Text(request,"button"); uint down=button=="left"?2u:button=="right"?8u:button=="middle"?32u:0;
      if(down==0) throw new Exception("INVALID_BUTTON"); inputs.Add(Mouse(down,0,0));inputs.Add(Mouse(down*2,0,0));Send(inputs.ToArray());return new {clicked=true};
    }
    CheckTarget(GetForegroundWindow());
    if(action=="key") {
      string[] names={"Enter","Tab","Backspace","Delete","ArrowLeft","ArrowRight","ArrowUp","ArrowDown","Home","End","PageUp","PageDown"};
      ushort[] values={13,9,8,46,37,39,38,40,36,35,33,34}; int index=Array.IndexOf(names,Text(request,"key")); if(index<0) throw new Exception("INVALID_KEY");
      uint extended=index>=3?1u:0;Send(new[]{KeyInput(values[index],0,extended),KeyInput(values[index],0,extended|2)});return new {pressed=true};
    }
    if(action=="typeText") {
      string text=Text(request,"text"); if(Encoding.UTF8.GetByteCount(text)>8192) throw new Exception("INVALID_TEXT");
      // Single-character batches let the hook service Esc between characters.
      foreach(char character in text) {Application.DoEvents();RequireActive();CheckTarget(GetForegroundWindow());Send(new[]{KeyInput(0,character,4),KeyInput(0,character,6)});}
      return new {typed=true};
    }
    throw new Exception("UNKNOWN_ACTION");
  }
  [STAThread] static void Main(string[] args) {
    if(args.Length==3 && args[0]=="--watchdog") {
      int pid; if(!int.TryParse(args[1],out pid) || pid<=0 || !args[2].StartsWith("Local\\DesktopControlCursor-",StringComparison.Ordinal)) return;
      try {using(Process parent=Process.GetProcessById(pid)) using(EventWaitHandle ready=EventWaitHandle.OpenExisting(args[2])) {ready.Set();parent.WaitForExit();RestoreCursor();}} catch {RestoreCursor();} return;
    }
    try {
      // Physical virtual-screen coordinates must agree with WindowFromPoint and SendInput.
      if(!SetProcessDpiAwarenessContext(new IntPtr(-4))) throw new Exception("DPI_CONTEXT_UNAVAILABLE");
      CheckEnvironment();
      if(args.Length!=2 || args[0]!="--protected") return;
      foreach(string item in args[1].Split(',')) {int pid;if(item.Length>0) {if(!int.TryParse(item,out pid)||pid<=0) return;Protected.Add(pid);}}
      Application.EnableVisualStyles(); Banner=new ControlBanner {FormBorderStyle=FormBorderStyle.None,TopMost=true,ShowInTaskbar=false,StartPosition=FormStartPosition.Manual,BackColor=Color.Black,ForeColor=Color.White,Width=520,Height=44,Left=Screen.PrimaryScreen.Bounds.Left,Top=Screen.PrimaryScreen.Bounds.Top};
      Banner.Controls.Add(new Label {Text="ChatGPT controls your computer   |   Esc to stop",Dock=DockStyle.Fill,TextAlign=ContentAlignment.MiddleCenter,Font=new Font("Segoe UI",11,FontStyle.Bold)});
      IntPtr handle=Banner.Handle;
      new Thread(()=> {
        try {while(true) { // Bounded line reader avoids unbounded ReadLine allocation.
          StringBuilder line=new StringBuilder(); int value; while((value=Console.In.Read())>=0 && value!='\n') {if(line.Length>=16384) throw new Exception();line.Append((char)value);}
          if(value<0) break; string payload=line.ToString(); Banner.Invoke((Action)(()=> {
            int id=0;try {var request=Json.Deserialize<Dictionary<string,object>>(payload);id=Integer(request,"id"); object result=Execute(request);Emit(new {id=id,ok=true,result=result});}
            catch(Exception error) {string code=error.Message; if(!System.Text.RegularExpressions.Regex.IsMatch(code,"^[A-Z_]+$")) code="NATIVE_ERROR";Emit(new {id=id,ok=false,error=code});}
          }));
        }} catch {} finally {try {Banner.BeginInvoke((Action)(()=> {Stop(false);Application.Exit();}));}catch {RestoreCursor();}}
      }) {IsBackground=true}.Start();
      Application.Run();
    } catch {Emit(new {id=0,ok=false,error="HELPER_INITIALIZATION_FAILED"});}
    finally {if(Active || Hook!=IntPtr.Zero || CursorTouched) Stop(false);}
  }
}
