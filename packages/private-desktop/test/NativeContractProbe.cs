using System;
using System.Reflection;
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
