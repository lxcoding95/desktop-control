using System;
using System.Reflection;
using System.Drawing;
using System.Collections;
using System.Windows.Forms;

// Loads types without invoking DesktopController.Main, input, screenshot or cursor APIs.
internal static class NativeContractProbe {
  static readonly BindingFlags Static=BindingFlags.Static|BindingFlags.NonPublic;
  [STAThread] static int Main(string[] args) {
    Assembly assembly=Assembly.LoadFrom(args[0]);
    Type desktop=assembly.GetType("DesktopController");
    if(args[1]=="banner") {
      Type bannerType=assembly.GetType("ControlBanner");
      if(bannerType==null) return 10;
      using(Form banner=(Form)Activator.CreateInstance(bannerType)) {
        if(!(bool)bannerType.GetProperty("ShowWithoutActivation",BindingFlags.Instance|BindingFlags.NonPublic).GetValue(banner,null)) return 11;
        CreateParams parameters=(CreateParams)bannerType.GetProperty("CreateParams",BindingFlags.Instance|BindingFlags.NonPublic).GetValue(banner,null);
        if((parameters.ExStyle&0x08000080)!=0x08000080 || banner.Visible) return 12;
      }
      return 0;
    }
    if(args[1]=="edges") {
      Type edgeType=assembly.GetType("ControlEdge");
      if(edgeType==null) return 60;
      MethodInfo geometry=edgeType.GetMethod("Geometry",Static),surface=edgeType.GetMethod("Surface",Static);
      if(geometry==null || surface==null) return 61;
      Rectangle screen=new Rectangle(-1920,-1080,1920,1080);
      Rectangle[] rectangles=(Rectangle[])geometry.Invoke(null,new object[]{screen,144u});
      Rectangle[] expected={new Rectangle(-1920,-1080,1920,9),new Rectangle(-1920,-9,1920,9),new Rectangle(-1920,-1071,9,1062),new Rectangle(-9,-1071,9,1062)};
      if(rectangles.Length!=4) return 62;
      for(int side=0;side<4;side++) {
        if(rectangles[side]!=expected[side] || !screen.Contains(rectangles[side])) return 63;
        for(int other=side+1;other<4;other++) if(rectangles[side].IntersectsWith(rectangles[other])) return 64;
        using(Form edge=(Form)Activator.CreateInstance(edgeType,BindingFlags.Instance|BindingFlags.NonPublic,null,new object[]{rectangles[side],side},null)) {
          CreateParams parameters=(CreateParams)edgeType.GetProperty("CreateParams",BindingFlags.Instance|BindingFlags.NonPublic).GetValue(edge,null);
          if((parameters.ExStyle&0x080800A0)!=0x080800A0 || !edge.TopMost || edge.ShowInTaskbar || edge.Visible || edge.Bounds!=rectangles[side]) return 65;
          if(!(bool)edgeType.GetProperty("ShowWithoutActivation",BindingFlags.Instance|BindingFlags.NonPublic).GetValue(edge,null)) return 66;
          object[] hit={Message.Create(IntPtr.Zero,0x84,IntPtr.Zero,IntPtr.Zero)};
          edgeType.GetMethod("WndProc",BindingFlags.Instance|BindingFlags.NonPublic).Invoke(edge,hit);
          if(((Message)hit[0]).Result!=new IntPtr(-1)) return 67;
          object[] activate={Message.Create(IntPtr.Zero,0x21,IntPtr.Zero,IntPtr.Zero)};
          edgeType.GetMethod("WndProc",BindingFlags.Instance|BindingFlags.NonPublic).Invoke(edge,activate);
          if(((Message)activate[0]).Result!=new IntPtr(3)) return 68;
        }
        using(Bitmap bitmap=(Bitmap)surface.Invoke(null,new object[]{side<2?64:8,side<2?8:64,side})) {
          int outer=-1;
          for(int distance=0;distance<8;distance++) {
            Color color=bitmap.GetPixel(side==2?distance:side==3?7-distance:32,side==0?distance:side==1?7-distance:32);
            if(distance==0 && (color.A!=96 || color.B<=color.G || color.G<=color.R)) return 69;
            if(distance>0 && color.A>outer) return 70;
            if(distance==7 && color.A!=0) return 71;outer=color.A;
          }
        }
      }
      Rectangle[] normal=(Rectangle[])geometry.Invoke(null,new object[]{new Rectangle(0,0,1920,1080),96u});
      Rectangle[] doubled=(Rectangle[])geometry.Invoke(null,new object[]{new Rectangle(0,0,1920,1080),192u});
      if(normal[0].Height!=6 || doubled[0].Height!=12) return 72;
      IList edges=(IList)desktop.GetField("Edges",Static).GetValue(null);
      Form hidden=(Form)Activator.CreateInstance(edgeType,BindingFlags.Instance|BindingFlags.NonPublic,null,new object[]{normal[0],0},null);
      edges.Add(hidden);desktop.GetMethod("CloseIndicators",Static).Invoke(null,null);
      if(edges.Count!=0 || !hidden.IsDisposed) return 73;
      return 0;
    }
    if(args[1]=="display-failure") {
      MethodInfo transition=desktop.GetMethod("EmergencyTransition",Static);
      FieldInfo active=desktop.GetField("Active",Static),latched=desktop.GetField("EmergencyLatched",Static);
      if(transition==null || active==null || latched==null) return 80;
      int persistence=0,notification=0,cleanupCount=0,shutdown=0;
      active.SetValue(null,true);latched.SetValue(null,false);
      Action persist=()=>{if((bool)active.GetValue(null) || !(bool)latched.GetValue(null)) throw new Exception("LATCH_ORDER");persistence++;throw new Exception("DISK_FAILURE");};
      Action notify=()=>{notification++;throw new Exception("PIPE_FAILURE");};
      Action<Action> marshal=cleanup=>{if((bool)active.GetValue(null) || !(bool)latched.GetValue(null)) throw new Exception("LATCH_ORDER");throw new Exception("MARSHAL_FAILURE");};
      transition.Invoke(null,new object[]{persist,notify,marshal,new Action(()=>cleanupCount++),new Action(()=>shutdown++)});
      if(persistence!=1 || notification!=1 || shutdown!=1 || cleanupCount!=0 || (bool)active.GetValue(null) || !(bool)latched.GetValue(null)) return 81;
      try {desktop.GetMethod("RequireActive",Static).Invoke(null,null);return 82;} catch(TargetInvocationException error) {if(error.InnerException.Message!="DESKTOP_STOPPED") return 83;}
      int queued=0;Action pending=null;
      transition.Invoke(null,new object[]{new Action(()=>persistence++),new Action(()=>notification++),new Action<Action>(cleanup=>{queued++;pending=cleanup;}),new Action(()=>cleanupCount++),new Action(()=>shutdown++)});
      if(queued!=1 || pending==null || cleanupCount!=0 || shutdown!=1 || (bool)active.GetValue(null)) return 84;
      pending();if(cleanupCount!=1) return 85;
      latched.SetValue(null,false);active.SetValue(null,false);return 0;
    }
    if(args[1]=="releases") {
      Type input=desktop.GetNestedType("INPUT",BindingFlags.NonPublic);
      Array batch=Array.CreateInstance(input,4);
      MethodInfo key=desktop.GetMethod("KeyInput",Static),mouse=desktop.GetMethod("Mouse",Static),release=desktop.GetMethod("ReleaseInputs",Static);
      if(release==null) return 20;
      batch.SetValue(key.Invoke(null,new object[]{(ushort)0,(ushort)65,4u}),0);
      batch.SetValue(key.Invoke(null,new object[]{(ushort)0,(ushort)65,6u}),1);
      batch.SetValue(mouse.Invoke(null,new object[]{2u,0,0}),2);
      batch.SetValue(mouse.Invoke(null,new object[]{4u,0,0}),3);
      Array output=(Array)release.Invoke(null,new object[]{batch});
      if(output.Length!=2) return 21;
      object first=input.GetField("u").GetValue(output.GetValue(0));
      object firstKey=first.GetType().GetField("key").GetValue(first);
      if((uint)firstKey.GetType().GetField("flags").GetValue(firstKey)!=6u) return 22;
      object second=input.GetField("u").GetValue(output.GetValue(1));
      object secondMouse=second.GetType().GetField("mouse").GetValue(second);
      if((uint)secondMouse.GetType().GetField("dwFlags").GetValue(secondMouse)!=4u) return 23;
      return 0;
    }
    if(args[1]=="cursor-contract") {
      FieldInfo idsField=desktop.GetField("SystemCursorIds",Static);
      MethodInfo apply=desktop.GetMethod("ApplyBlackCursors",Static);
      if(idsField==null || apply==null) return 40;
      uint[] ids=(uint[])idsField.GetValue(null), expected={32512,32513,32514,32515,32516,32642,32643,32644,32645,32646,32648,32649,32650};
      if(ids.Length!=expected.Length) return 41;
      for(int index=0;index<ids.Length;index++) if(ids[index]!=expected[index]) return 42;
      int creates=0,sets=0,restores=0,destroys=0;
      Func<IntPtr> create=()=>{creates++;return new IntPtr(1);};
      Func<IntPtr,uint,bool> success=(cursor,id)=>{sets++;return true;};
      Action restore=()=>restores++;Action<IntPtr> destroy=cursor=>destroys++;
      apply.Invoke(null,new object[]{create,success,restore,destroy,new Func<int>(()=>87)});
      if(creates!=expected.Length || sets!=expected.Length || restores!=0 || destroys!=0) return 43;
      creates=sets=restores=destroys=0;
      Func<IntPtr,uint,bool> fail=(cursor,id)=>{sets++;return id!=32513;};
      try {apply.Invoke(null,new object[]{create,fail,restore,destroy,new Func<int>(()=>87)});return 44;}
      catch(TargetInvocationException error) {if(error.InnerException.Message!="CURSOR_FAILED") return 45;}
      if(creates!=2 || sets!=2 || restores!=1 || destroys!=1) return 46;
      if((uint)desktop.GetField("LastCursorFailureId",Static).GetValue(null)!=32513 || (int)desktop.GetField("LastCursorFailureError",Static).GetValue(null)!=87) return 47;
      return 0;
    }
    if(args[1]=="start-cleanup") {
      MethodInfo start=desktop.GetMethod("StartResources",Static);
      if(start==null) return 50;
      for(int failure=0;failure<4;failure++) {
        int step=failure,cleanups=0;
        Action watch=()=>{if(step==0) throw new Exception("WATCHDOG_FAILURE");};
        Func<IntPtr> hook=()=>{if(step==1) throw new Exception("HOOK_FAILURE");return new IntPtr(1);};
        Action cursor=()=>{if(step==2) throw new Exception("CURSOR_FAILURE");};
        Action show=()=>{if(step==3) throw new Exception("BANNER_FAILURE");};
        Action cleanup=()=>{cleanups++;desktop.GetField("Hook",Static).SetValue(null,IntPtr.Zero);desktop.GetField("Active",Static).SetValue(null,false);};
        try {start.Invoke(null,new object[]{watch,hook,cursor,show,cleanup});return 51;}
        catch(TargetInvocationException) {}
        if(cleanups!=1) return 52;
      }
      return 0;
    }
    return 30;
  }
}
