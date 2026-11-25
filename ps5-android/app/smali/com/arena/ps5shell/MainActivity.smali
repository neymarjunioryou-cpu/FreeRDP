.class public Lcom/arena/ps5shell/MainActivity;
.super Landroid/app/Activity;
.source "MainActivity.java"

# ---------------------------------------------------------------------------
# PS5 Shell -- hand-written smali (no Android SDK / Gradle / Kotlin needed).
#
# Responsibilities:
#   * host a full-screen WebView that loads the bundled HTML5 console UI
#   * immersive fullscreen, no overscroll, no white flash
#   * forward hardware gamepad KeyEvents and MotionEvent axes into JavaScript
#     (ARENA.key / ARENA.axis) because Android WebView has no Gamepad API
#   * map the system Back key onto WebView history (the UI uses pushState)
#
# Everything shipped in assets/ is original code written for this project.
# ---------------------------------------------------------------------------

.field private web:Landroid/webkit/WebView;


# ---------------------------------------------------------------------------
# constructor
# ---------------------------------------------------------------------------
.method public constructor <init>()V
    .locals 0

    invoke-direct {p0}, Landroid/app/Activity;-><init>()V

    return-void
.end method


# ---------------------------------------------------------------------------
# onCreate
# ---------------------------------------------------------------------------
.method protected onCreate(Landroid/os/Bundle;)V
    .locals 5

    invoke-super {p0, p1}, Landroid/app/Activity;->onCreate(Landroid/os/Bundle;)V

    # Immersive sticky fullscreen (stable layout + hide nav/status + sticky)
    invoke-virtual {p0}, Landroid/app/Activity;->getWindow()Landroid/view/Window;
    move-result-object v0

    invoke-virtual {v0}, Landroid/view/Window;->getDecorView()Landroid/view/View;
    move-result-object v0

    const/16 v1, 0x1706
    invoke-virtual {v0, v1}, Landroid/view/View;->setSystemUiVisibility(I)V

    # WebView
    new-instance v0, Landroid/webkit/WebView;
    invoke-direct {v0, p0}, Landroid/webkit/WebView;-><init>(Landroid/content/Context;)V
    iput-object v0, p0, Lcom/arena/ps5shell/MainActivity;->web:Landroid/webkit/WebView;

    const/4 v3, 0x0
    invoke-virtual {v0, v3}, Landroid/webkit/WebView;->setBackgroundColor(I)V

    const/4 v4, 0x2
    invoke-virtual {v0, v4}, Landroid/view/View;->setOverScrollMode(I)V

    # WebSettings
    invoke-virtual {v0}, Landroid/webkit/WebView;->getSettings()Landroid/webkit/WebSettings;
    move-result-object v1

    const/4 v2, 0x1
    invoke-virtual {v1, v2}, Landroid/webkit/WebSettings;->setJavaScriptEnabled(Z)V
    invoke-virtual {v1, v2}, Landroid/webkit/WebSettings;->setDomStorageEnabled(Z)V
    invoke-virtual {v1, v2}, Landroid/webkit/WebSettings;->setAllowFileAccess(Z)V
    invoke-virtual {v1, v2}, Landroid/webkit/WebSettings;->setDatabaseEnabled(Z)V

    # Let WebAudio start without a gesture (the boot sound is synthesised).
    invoke-virtual {v1, v3}, Landroid/webkit/WebSettings;->setMediaPlaybackRequiresUserGesture(Z)V

    # Keep file:// navigation inside the WebView instead of the browser.
    new-instance v2, Landroid/webkit/WebViewClient;
    invoke-direct {v2}, Landroid/webkit/WebViewClient;-><init>()V
    invoke-virtual {v0, v2}, Landroid/webkit/WebView;->setWebViewClient(Landroid/webkit/WebViewClient;)V

    const-string v2, "file:///android_asset/index.html"
    invoke-virtual {v0, v2}, Landroid/webkit/WebView;->loadUrl(Ljava/lang/String;)V

    invoke-virtual {p0, v0}, Landroid/app/Activity;->setContentView(Landroid/view/View;)V

    return-void
.end method


# ---------------------------------------------------------------------------
# lifecycle
# ---------------------------------------------------------------------------
.method protected onPause()V
    .locals 1

    invoke-super {p0}, Landroid/app/Activity;->onPause()V

    iget-object v0, p0, Lcom/arena/ps5shell/MainActivity;->web:Landroid/webkit/WebView;
    if-eqz v0, :done
    invoke-virtual {v0}, Landroid/webkit/WebView;->onPause()V

    :done
    return-void
.end method


.method protected onResume()V
    .locals 1

    invoke-super {p0}, Landroid/app/Activity;->onResume()V

    iget-object v0, p0, Lcom/arena/ps5shell/MainActivity;->web:Landroid/webkit/WebView;
    if-eqz v0, :done
    invoke-virtual {v0}, Landroid/webkit/WebView;->onResume()V

    :done
    return-void
.end method


# ---------------------------------------------------------------------------
# Back: walk the WebView history (the UI pushes a state per screen), then exit
# ---------------------------------------------------------------------------
.method public onBackPressed()V
    .locals 2

    iget-object v0, p0, Lcom/arena/ps5shell/MainActivity;->web:Landroid/webkit/WebView;
    if-eqz v0, :super_call

    invoke-virtual {v0}, Landroid/webkit/WebView;->canGoBack()Z
    move-result v1
    if-nez v1, :super_call

    invoke-virtual {v0}, Landroid/webkit/WebView;->goBack()V
    return-void

    :super_call
    invoke-super {p0}, Landroid/app/Activity;->onBackPressed()V
    return-void
.end method


# ---------------------------------------------------------------------------
# Hardware gamepad buttons -> ARENA.key(keyCode, action)
# ---------------------------------------------------------------------------
.method public dispatchKeyEvent(Landroid/view/KeyEvent;)Z
    .locals 8

    invoke-virtual {p1}, Landroid/view/InputEvent;->getSource()I
    move-result v0

    const/16 v1, 0x401
    and-int v2, v0, v1
    if-nez v2, :gamepad

    const v1, 0x1000010
    and-int v2, v0, v1
    if-eqz v2, :super_call

    :gamepad
    invoke-virtual {p1}, Landroid/view/KeyEvent;->getKeyCode()I
    move-result v0

    invoke-virtual {p1}, Landroid/view/KeyEvent;->getAction()I
    move-result v1

    new-instance v3, Ljava/lang/StringBuilder;
    invoke-direct {v3}, Ljava/lang/StringBuilder;-><init>()V

    const-string v4, "ARENA.key("
    invoke-virtual {v3, v4}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;

    invoke-virtual {v3, v0}, Ljava/lang/StringBuilder;->append(I)Ljava/lang/StringBuilder;

    const-string v4, ","
    invoke-virtual {v3, v4}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;

    invoke-virtual {v3, v1}, Ljava/lang/StringBuilder;->append(I)Ljava/lang/StringBuilder;

    const-string v4, ");"
    invoke-virtual {v3, v4}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;

    invoke-virtual {v3}, Ljava/lang/StringBuilder;->toString()Ljava/lang/String;
    move-result-object v3

    invoke-virtual {p0, v3}, Lcom/arena/ps5shell/MainActivity;->js(Ljava/lang/String;)V

    const/4 v0, 0x1
    return v0

    :super_call
    invoke-super {p0, p1}, Landroid/app/Activity;->dispatchKeyEvent(Landroid/view/KeyEvent;)Z
    move-result v0
    return v0
.end method


# ---------------------------------------------------------------------------
# Hardware analog sticks / triggers / d-pad hat -> ARENA.axis(...)
# Axis order (Android MotionEvent constants), chosen to cover DualSense,
# DualShock 4 and generic gamepads (see chiaki-ng StreamInput.kt):
#   X=0, Y=1, Z=11, RZ=14, RX=12, RY=13,
#   LTRIGGER=17, RTRIGGER=18, GAS=22, BRAKE=23, HAT_X=15, HAT_Y=16
# JavaScript decides which pair is the right stick and which pair is L2/R2.
# ---------------------------------------------------------------------------
.method public dispatchGenericMotionEvent(Landroid/view/MotionEvent;)Z
    .locals 8

    invoke-virtual {p1}, Landroid/view/InputEvent;->getSource()I
    move-result v0

    const/16 v1, 0x401
    and-int v2, v0, v1
    if-nez v2, :axes

    const v1, 0x1000010
    and-int v2, v0, v1
    if-eqz v2, :super_call

    :axes
    new-instance v3, Ljava/lang/StringBuilder;
    invoke-direct {v3}, Ljava/lang/StringBuilder;-><init>()V

    const-string v4, "ARENA.axis("
    invoke-virtual {v3, v4}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;

    const/4 v4, 0x0
    invoke-static {v3, p1, v4}, Lcom/arena/ps5shell/MainActivity;->appendAxis(Ljava/lang/StringBuilder;Landroid/view/MotionEvent;I)V

    const/4 v4, 0x1
    invoke-static {v3, p1, v4}, Lcom/arena/ps5shell/MainActivity;->appendAxis(Ljava/lang/StringBuilder;Landroid/view/MotionEvent;I)V

    const/16 v4, 0xb
    invoke-static {v3, p1, v4}, Lcom/arena/ps5shell/MainActivity;->appendAxis(Ljava/lang/StringBuilder;Landroid/view/MotionEvent;I)V

    const/16 v4, 0xe
    invoke-static {v3, p1, v4}, Lcom/arena/ps5shell/MainActivity;->appendAxis(Ljava/lang/StringBuilder;Landroid/view/MotionEvent;I)V

    const/16 v4, 0xc
    invoke-static {v3, p1, v4}, Lcom/arena/ps5shell/MainActivity;->appendAxis(Ljava/lang/StringBuilder;Landroid/view/MotionEvent;I)V

    const/16 v4, 0xd
    invoke-static {v3, p1, v4}, Lcom/arena/ps5shell/MainActivity;->appendAxis(Ljava/lang/StringBuilder;Landroid/view/MotionEvent;I)V

    const/16 v4, 0x11
    invoke-static {v3, p1, v4}, Lcom/arena/ps5shell/MainActivity;->appendAxis(Ljava/lang/StringBuilder;Landroid/view/MotionEvent;I)V

    const/16 v4, 0x12
    invoke-static {v3, p1, v4}, Lcom/arena/ps5shell/MainActivity;->appendAxis(Ljava/lang/StringBuilder;Landroid/view/MotionEvent;I)V

    const/16 v4, 0x16
    invoke-static {v3, p1, v4}, Lcom/arena/ps5shell/MainActivity;->appendAxis(Ljava/lang/StringBuilder;Landroid/view/MotionEvent;I)V

    const/16 v4, 0x17
    invoke-static {v3, p1, v4}, Lcom/arena/ps5shell/MainActivity;->appendAxis(Ljava/lang/StringBuilder;Landroid/view/MotionEvent;I)V

    const/16 v4, 0xf
    invoke-static {v3, p1, v4}, Lcom/arena/ps5shell/MainActivity;->appendAxis(Ljava/lang/StringBuilder;Landroid/view/MotionEvent;I)V

    const/16 v4, 0x10
    invoke-static {v3, p1, v4}, Lcom/arena/ps5shell/MainActivity;->appendAxis(Ljava/lang/StringBuilder;Landroid/view/MotionEvent;I)V

    const-string v4, "0);"    # trailing dummy arg avoids a trailing comma in older WebViews
    invoke-virtual {v3, v4}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;

    invoke-virtual {v3}, Ljava/lang/StringBuilder;->toString()Ljava/lang/String;
    move-result-object v3

    invoke-virtual {p0, v3}, Lcom/arena/ps5shell/MainActivity;->js(Ljava/lang/String;)V

    const/4 v0, 0x1
    return v0

    :super_call
    invoke-super {p0, p1}, Landroid/app/Activity;->dispatchGenericMotionEvent(Landroid/view/MotionEvent;)Z
    move-result v0
    return v0
.end method


# Append "<axisValue>," to a StringBuilder.  Static helper keeps the motion
# handler small and the register count inside the 4-bit range of invoke-*.
.method private static appendAxis(Ljava/lang/StringBuilder;Landroid/view/MotionEvent;I)V
    .locals 2

    invoke-virtual {p1, p2}, Landroid/view/MotionEvent;->getAxisValue(I)F
    move-result v0

    invoke-virtual {p0, v0}, Ljava/lang/StringBuilder;->append(F)Ljava/lang/StringBuilder;

    const-string v1, ","
    invoke-virtual {p0, v1}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;

    return-void
.end method


# evaluateJavascript into the live page (no-op before the page is ready).
.method private js(Ljava/lang/String;)V
    .locals 3

    iget-object v0, p0, Lcom/arena/ps5shell/MainActivity;->web:Landroid/webkit/WebView;
    if-eqz v0, :done

    const/4 v1, 0x0
    invoke-virtual {v0, p1, v1}, Landroid/webkit/WebView;->evaluateJavascript(Ljava/lang/String;Landroid/webkit/ValueCallback;)V

    :done
    return-void
.end method
