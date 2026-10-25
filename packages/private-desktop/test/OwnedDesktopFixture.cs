using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Forms;

// Test-only visible window. No screen capture, arbitrary typing, clicking, file action or shell RPC.
internal static class OwnedDesktopFixture {
  static Form Window;
  static Button Button;
  static TextBox TextBox;
  static int Clicks;
  static readonly JavaScriptSerializer Json=new JavaScriptSerializer();
  static readonly object Output=new object();
  static readonly HashSet<int> KnownHelpers=new HashSet<int>();
  delegate bool EnumProc(IntPtr window,IntPtr parameter);
  [StructLayout(LayoutKind.Sequential)] struct Point {public int X,Y;}
  [StructLayout(LayoutKind.Sequential)] struct NativeRect {public int Left,Top,Right,Bottom;}
  [StructLayout(LayoutKind.Sequential)] struct IconInfo {public bool IsIcon;public uint HotX,HotY;public IntPtr Mask,Color;}
  [StructLayout(LayoutKind.Sequential)] struct INPUT {public uint Type;public InputUnion U;}
  [StructLayout(LayoutKind.Explicit)] struct InputUnion {[FieldOffset(0)] public MOUSEINPUT Mouse;[FieldOffset(0)] public KEYBDINPUT Key;}
  [StructLayout(LayoutKind.Sequential)] struct MOUSEINPUT {public int X,Y;public uint Data,Flags,Time;public UIntPtr Extra;}
  [StructLayout(LayoutKind.Sequential)] struct KEYBDINPUT {public ushort Key,Scan;public uint Flags,Time;public UIntPtr Extra;}
  [DllImport("user32.dll",SetLastError=true)] static extern bool SetProcessDpiAwarenessContext(IntPtr context);
  [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr window);
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern IntPtr GetFocus();
  [DllImport("user32.dll")] static extern IntPtr WindowFromPoint(Point point);
  [DllImport("user32.dll")] static extern IntPtr GetAncestor(IntPtr window,uint flags);
  [DllImport("user32.dll")] static extern IntPtr LoadCursor(IntPtr instance,IntPtr name);
  [DllImport("user32.dll")] static extern IntPtr CopyIcon(IntPtr icon);
  [DllImport("user32.dll")] static extern bool DestroyIcon(IntPtr icon);
  [DllImport("user32.dll")] static extern bool GetIconInfo(IntPtr icon,out IconInfo info);
  [DllImport("gdi32.dll")] static extern bool DeleteObject(IntPtr value);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc callback,IntPtr parameter);
  [DllImport("user32.dll")] static extern bool EnumChildWindows(IntPtr parent,EnumProc callback,IntPtr parameter);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr window);
  [DllImport("user32.dll",EntryPoint="GetWindowLongPtrW")] static extern IntPtr GetWindowLongPtr(IntPtr window,int index);
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr window,out NativeRect rectangle);
  [DllImport("user32.dll")] static extern uint GetDpiForWindow(IntPtr window);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr window,out uint pid);
  [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern int GetWindowText(IntPtr window,StringBuilder buffer,int maximum);
  [DllImport("user32.dll")] static extern uint SendInput(uint count,INPUT[] input,int size);
  static void Emit(object value) {lock(Output) Console.WriteLine(Json.Serialize(value));}
  static void RequireForeground() {if(GetForegroundWindow()!=Window.Handle) throw new Exception("FIXTURE_NOT_FOREGROUND");}
  static object Focus(string name) {
    Control control=name=="button"?(Control)Button:name=="textbox"?(Control)TextBox:null;
    if(control==null) throw new Exception("INVALID_CONTROL");
    SetForegroundWindow(Window.Handle);Window.Activate();control.Focus();Application.DoEvents();RequireForeground();
    if(GetFocus()!=control.Handle) throw new Exception("FIXTURE_CONTROL_NOT_FOCUSED");
    System.Drawing.Point center=control.PointToScreen(new System.Drawing.Point(control.Width/2,control.Height/2));
    IntPtr target=WindowFromPoint(new Point{X=center.X,Y=center.Y});
    if(GetAncestor(target,2)!=Window.Handle) throw new Exception("FIXTURE_CONTROL_OBSCURED");
    return new {focused=true,x=center.X,y=center.Y};
  }
  static object CursorFingerprint() {
    IntPtr cursor=CopyIcon(LoadCursor(IntPtr.Zero,new IntPtr(32512)));
    if(cursor==IntPtr.Zero) throw new Exception("CURSOR_PROBE_FAILED");
    IconInfo icon=new IconInfo();
    try {
      if(!GetIconInfo(cursor,out icon) || icon.Mask==IntPtr.Zero) throw new Exception("CURSOR_PROBE_FAILED");
      using(MemoryStream bytes=new MemoryStream()) using(BinaryWriter writer=new BinaryWriter(bytes)) {
        foreach(IntPtr handle in new[]{icon.Mask,icon.Color}) {
          writer.Write(handle!=IntPtr.Zero);if(handle==IntPtr.Zero) continue;
          using(Bitmap bitmap=Bitmap.FromHbitmap(handle)) {
            if(bitmap.Width>1024 || bitmap.Height>2048) throw new Exception("CURSOR_PROBE_TOO_LARGE");
            writer.Write(bitmap.Width);writer.Write(bitmap.Height);
            for(int y=0;y<bitmap.Height;y++) for(int x=0;x<bitmap.Width;x++) writer.Write(bitmap.GetPixel(x,y).ToArgb());
          }
        }
        writer.Flush();using(SHA256 sha=SHA256.Create()) return new {hash=BitConverter.ToString(sha.ComputeHash(bytes.ToArray())).Replace("-","").ToLowerInvariant()};
      }
    } finally {if(icon.Mask!=IntPtr.Zero) DeleteObject(icon.Mask);if(icon.Color!=IntPtr.Zero) DeleteObject(icon.Color);DestroyIcon(cursor);}
  }
  static object ProbeBanner(int pid) {
    using(Process helper=Process.GetProcessById(pid)) if(!helper.ProcessName.Equals("desktop-controller",StringComparison.OrdinalIgnoreCase)) throw new Exception("INVALID_HELPER_PID");
    bool found=false;
    EnumWindows((window,unused)=> {
      uint owner;GetWindowThreadProcessId(window,out owner);if(owner!=(uint)pid || !IsWindowVisible(window)) return true;
      EnumChildWindows(window,(child,unusedChild)=> {StringBuilder text=new StringBuilder(128);GetWindowText(child,text,128);if(text.ToString().Contains("ChatGPT controls your computer")) found=true;return true;},IntPtr.Zero);
      return true;
    },IntPtr.Zero);
    return new {visible=found};
  }
  static object ProbeEdges(int pid) {
    if(pid<=0) throw new Exception("INVALID_HELPER_PID");
    try {using(Process helper=Process.GetProcessById(pid)) {if(!helper.ProcessName.Equals("desktop-controller",StringComparison.OrdinalIgnoreCase)) throw new Exception("INVALID_HELPER_PID");KnownHelpers.Add(pid);}}
    catch(ArgumentException) {if(!KnownHelpers.Contains(pid)) throw new Exception("INVALID_HELPER_PID");}
    int count=0;bool clickThrough=true,nonActivating=true,geometry=true;Dictionary<string,int> monitors=new Dictionary<string,int>();
    EnumWindows((window,unused)=>{
      uint owner;GetWindowThreadProcessId(window,out owner);if(owner!=(uint)pid || !IsWindowVisible(window)) return true;
      StringBuilder title=new StringBuilder(128);GetWindowText(window,title,128);
      const string prefix="Desktop Control edge ";if(!title.ToString().StartsWith(prefix,StringComparison.Ordinal)) return true;
      count++;long style=GetWindowLongPtr(window,-20).ToInt64();
      clickThrough=clickThrough && (style&0x00080020)==0x00080020;
      nonActivating=nonActivating && (style&0x08000088)==0x08000088;
      NativeRect rectangle;int side;
      if(!GetWindowRect(window,out rectangle) || !Int32.TryParse(title.ToString().Substring(prefix.Length),out side) || side<0 || side>3) {geometry=false;return true;}
      Rectangle actual=Rectangle.FromLTRB(rectangle.Left,rectangle.Top,rectangle.Right,rectangle.Bottom);
      Rectangle screen=Screen.FromRectangle(actual).Bounds;uint dpi=GetDpiForWindow(window);
      int thickness=Math.Min(Math.Max(4,Math.Min(12,(int)Math.Round(6.0*dpi/96.0))),Math.Min(screen.Width,screen.Height)/4);
      Rectangle expected=side==0?new Rectangle(screen.Left,screen.Top,screen.Width,thickness):side==1?new Rectangle(screen.Left,screen.Bottom-thickness,screen.Width,thickness):side==2?new Rectangle(screen.Left,screen.Top+thickness,thickness,screen.Height-2*thickness):new Rectangle(screen.Right-thickness,screen.Top+thickness,thickness,screen.Height-2*thickness);
      if(dpi<48 || dpi>960 || actual!=expected) geometry=false;
      string key=screen.ToString();int mask;monitors.TryGetValue(key,out mask);
      if((mask&(1<<side))!=0) geometry=false;monitors[key]=mask|(1<<side);
      return true;
    },IntPtr.Zero);
    bool complete=monitors.Count==Screen.AllScreens.Length;
    foreach(int mask in monitors.Values) if(mask!=15) complete=false;
    return new {count=count,monitors=Screen.AllScreens.Length,clickThrough=clickThrough,nonActivating=nonActivating,geometryValid=geometry,completeScreens=complete};
  }
  static object Execute(Dictionary<string,object> request) {
    string action=(string)request["action"];
    if(action=="focus") return Focus((string)request["control"]);
    if(action=="guard") {RequireForeground();return new {foreground=true};}
    if(action=="counts") return new {clicks=Clicks,textLength=TextBox.Text.Length};
    if(action=="cursor") return CursorFingerprint();
    if(action=="banner") return ProbeBanner((int)request["pid"]);
    if(action=="edges") return ProbeEdges((int)request["pid"]);
    if(action=="escape") {
      RequireForeground();
      INPUT[] input={new INPUT{Type=1,U=new InputUnion{Key=new KEYBDINPUT{Key=27}}},new INPUT{Type=1,U=new InputUnion{Key=new KEYBDINPUT{Key=27,Flags=2}}}};
      if(SendInput(2,input,Marshal.SizeOf(typeof(INPUT)))!=2) throw new Exception("ESCAPE_INPUT_FAILED");
      return new {sent=true};
    }
    if(action=="close") {Window.BeginInvoke((Action)(()=>Application.Exit()));return new {closed=true};}
    throw new Exception("INVALID_ACTION");
  }
  [STAThread] static void Main() {
    try {
      if(!SetProcessDpiAwarenessContext(new IntPtr(-4))) throw new Exception("DPI_CONTEXT_UNAVAILABLE");
      Application.EnableVisualStyles();
      Window=new Form{Text="Desktop Control owned test "+Guid.NewGuid().ToString("N"),Width=560,Height=260,StartPosition=FormStartPosition.CenterScreen};
      Button=new Button{Text="Owned fixture button",Left=40,Top=50,Width=220,Height=45};
      TextBox=new TextBox{Left=40,Top=120,Width=420};
      Button.Click+=(sender,eventArgs)=>Clicks++;Window.Controls.Add(Button);Window.Controls.Add(TextBox);
      Window.Shown+=(sender,eventArgs)=>Emit(new {@event="ready",pid=Process.GetCurrentProcess().Id});
      IntPtr handle=Window.Handle;
      new Thread(()=> {
        try {while(true) {
          StringBuilder line=new StringBuilder();int character;
          while((character=Console.In.Read())>=0 && character!='\n') {if(line.Length>=4096) throw new Exception();line.Append((char)character);}
          if(character<0) break;string payload=line.ToString();
          Window.Invoke((Action)(()=> {int id=0;try {var request=Json.Deserialize<Dictionary<string,object>>(payload);id=(int)request["id"];Emit(new{id=id,ok=true,result=Execute(request)});}catch(Exception error){string code=error.Message;if(!System.Text.RegularExpressions.Regex.IsMatch(code,"^[A-Z_]+$")) code="FIXTURE_FAILED";Emit(new{id=id,ok=false,error=code});}}));
        }} catch {} finally {try {Window.BeginInvoke((Action)(()=>Application.Exit()));} catch {}}
      }) {IsBackground=true}.Start();
      // Unlike the production hidden banner, this fixture must be shown by the message loop.
      Application.Run(Window);
    } catch {Emit(new{@event="failed",code="FIXTURE_INITIALIZATION_FAILED"});}
  }
}
