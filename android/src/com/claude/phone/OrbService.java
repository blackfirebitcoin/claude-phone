package com.claude.phone;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Intent;
import android.graphics.PixelFormat;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.Vibrator;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Locale;

/**
 * Push-to-talk Claude overlay.
 *
 * Tap → server STT (termux-speech-to-text) → server Claude → native TTS → idle.
 * Two HTTP calls on one thread. Dead simple.
 */
public class OrbService extends Service {

    private static final String SERVER = "http://localhost:3000";

    private WindowManager wm;
    private OrbView orb;
    private WindowManager.LayoutParams lp;
    private Handler h;
    private Vibrator vib;
    private TextToSpeech tts;
    private volatile boolean ready = true;

    private float tx, ty;
    private int ox, oy;
    private boolean drag;
    private long downAt;

    @Override
    public void onCreate() {
        super.onCreate();
        h = new Handler(Looper.getMainLooper());
        vib = (Vibrator) getSystemService(VIBRATOR_SERVICE);
        wm = (WindowManager) getSystemService(WINDOW_SERVICE);

        // Notification
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel ch = new NotificationChannel("orb", "Claude Orb",
                    NotificationManager.IMPORTANCE_LOW);
            ch.setShowBadge(false);
            ((NotificationManager) getSystemService(NOTIFICATION_SERVICE))
                    .createNotificationChannel(ch);
        }
        Notification.Builder nb = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? new Notification.Builder(this, "orb")
                : new Notification.Builder(this);
        startForeground(1, nb.setContentTitle("Claude Orb").setContentText("Tap to talk")
                .setSmallIcon(android.R.drawable.ic_btn_speak_now).setOngoing(true).build());

        // Overlay
        int size = dp(80);
        orb = new OrbView(this);
        int type = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
                : WindowManager.LayoutParams.TYPE_PHONE;
        lp = new WindowManager.LayoutParams(size, size, type,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                        | WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
                PixelFormat.TRANSLUCENT);
        lp.gravity = Gravity.TOP | Gravity.START;
        lp.x = dp(16); lp.y = dp(100);
        orb.setOnTouchListener(new View.OnTouchListener() {
            @Override public boolean onTouch(View v, MotionEvent e) {
                return handleTouch(e);
            }
        });
        wm.addView(orb, lp);
    }

    @Override public int onStartCommand(Intent i, int f, int id) { return START_STICKY; }
    @Override public IBinder onBind(Intent i) { return null; }

    @Override
    public void onDestroy() {
        if (tts != null) { tts.stop(); tts.shutdown(); }
        if (orb != null) { orb.destroy(); wm.removeView(orb); }
        super.onDestroy();
    }

    private boolean handleTouch(MotionEvent e) {
        switch (e.getAction()) {
            case MotionEvent.ACTION_DOWN:
                tx = e.getRawX(); ty = e.getRawY();
                ox = lp.x; oy = lp.y;
                drag = false; downAt = System.currentTimeMillis();
                return true;
            case MotionEvent.ACTION_MOVE:
                if (Math.abs(e.getRawX() - tx) > 15 || Math.abs(e.getRawY() - ty) > 15) drag = true;
                if (drag) {
                    lp.x = ox + (int)(e.getRawX() - tx);
                    lp.y = oy + (int)(e.getRawY() - ty);
                    wm.updateViewLayout(orb, lp);
                }
                return true;
            case MotionEvent.ACTION_UP:
                if (!drag) {
                    if (System.currentTimeMillis() - downAt > 3000) stopSelf();
                    else if (ready) go();
                }
                return true;
        }
        return false;
    }

    // ── Push to talk ─────────────────────────────────────────────────

    private void go() {
        ready = false;

        // Kill TTS if speaking
        if (tts != null) { tts.stop(); tts.shutdown(); tts = null; }

        // → LISTENING
        orb.setState(OrbView.LISTENING);
        buzz(40);

        new Thread(new Runnable() {
            @Override public void run() {

                // 1. Listen (server runs termux-speech-to-text)
                String r1 = post("/api/listen", "{}", 60000);
                if (r1 == null || !r1.contains("\"heard\"") || r1.contains("\"heard\":null")) {
                    done(true); // double buzz = no speech
                    return;
                }

                String heard = extract(r1, "heard");
                if (heard.isEmpty()) { done(true); return; }

                // → THINKING
                h.post(new Runnable() {
                    @Override public void run() {
                        orb.setState(OrbView.THINKING);
                        buzz(50);
                    }
                });

                // 2. Ask Claude
                String r2 = post("/api/ask", "{\"command\":\"" + esc(heard) + "\"}", 120000);
                if (r2 == null || !r2.contains("\"response\"")) {
                    done(false); // single long buzz = error
                    return;
                }

                final String response = extract(r2, "response");
                if (response.isEmpty()) { done(false); return; }

                // → SPEAKING
                h.post(new Runnable() {
                    @Override public void run() {
                        orb.setState(OrbView.SPEAKING);
                        ready = true; // can tap again while speaking
                        speak(response);
                    }
                });
            }
        }).start();
    }

    private void done(final boolean noSpeech) {
        h.post(new Runnable() {
            @Override public void run() {
                if (noSpeech) {
                    buzz(50);
                    h.postDelayed(new Runnable() {
                        @Override public void run() { buzz(50); }
                    }, 120);
                } else {
                    buzz(200);
                }
                orb.setState(OrbView.IDLE);
                ready = true;
            }
        });
    }

    // ── TTS ──────────────────────────────────────────────────────────

    private void speak(final String text) {
        final String clean = text
            .replaceAll("```[\\s\\S]*?```", "")
            .replaceAll("`([^`]+)`", "$1")
            .replaceAll("\\*\\*([^*]+)\\*\\*", "$1")
            .replaceAll("#{1,6}\\s", "")
            .replaceAll("[_~|>]", "")
            .trim();

        if (clean.isEmpty()) { orb.setState(OrbView.IDLE); return; }

        tts = new TextToSpeech(this, new TextToSpeech.OnInitListener() {
            @Override public void onInit(int status) {
                if (status == TextToSpeech.SUCCESS) {
                    tts.setLanguage(Locale.US);
                    tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                        @Override public void onStart(String id) {}
                        @Override public void onError(String id) {
                            h.post(new Runnable() {
                                @Override public void run() {
                                    if (orb.getState() == OrbView.SPEAKING) orb.setState(OrbView.IDLE);
                                }
                            });
                        }
                        @Override public void onDone(String id) {
                            h.post(new Runnable() {
                                @Override public void run() {
                                    if (orb.getState() == OrbView.SPEAKING) orb.setState(OrbView.IDLE);
                                }
                            });
                        }
                    });
                    Bundle p = new Bundle();
                    tts.speak(clean, TextToSpeech.QUEUE_FLUSH, p, "r");
                } else {
                    orb.setState(OrbView.IDLE);
                }
            }
        });
    }

    // ── HTTP ─────────────────────────────────────────────────────────

    private String post(String path, String body, int timeoutMs) {
        try {
            URL url = new URL(SERVER + path);
            HttpURLConnection c = (HttpURLConnection) url.openConnection();
            c.setRequestMethod("POST");
            c.setRequestProperty("Content-Type", "application/json");
            c.setDoOutput(true);
            c.setConnectTimeout(5000);
            c.setReadTimeout(timeoutMs);
            OutputStream os = c.getOutputStream();
            os.write(body.getBytes("UTF-8"));
            os.close();
            int code = c.getResponseCode();
            BufferedReader r = new BufferedReader(new InputStreamReader(
                    code >= 400 ? c.getErrorStream() : c.getInputStream()));
            StringBuilder sb = new StringBuilder();
            String line;
            while ((line = r.readLine()) != null) sb.append(line);
            r.close(); c.disconnect();
            return sb.toString();
        } catch (Exception e) {
            return null;
        }
    }

    private static String extract(String json, String key) {
        String s = "\"" + key + "\":\"";
        int i = json.indexOf(s);
        if (i < 0) return "";
        i += s.length();
        StringBuilder sb = new StringBuilder();
        for (; i < json.length(); i++) {
            char ch = json.charAt(i);
            if (ch == '\\' && i + 1 < json.length()) sb.append(json.charAt(++i));
            else if (ch == '"') break;
            else sb.append(ch);
        }
        return sb.toString();
    }

    private void buzz(int ms) { if (vib != null) vib.vibrate(ms); }
    private int dp(int d) { return Math.round(d * getResources().getDisplayMetrics().density); }

    private static String esc(String s) {
        return s.replace("\\", "\\\\").replace("\"", "\\\"")
                .replace("\n", "\\n").replace("\r", "\\r").replace("\t", "\\t");
    }
}
