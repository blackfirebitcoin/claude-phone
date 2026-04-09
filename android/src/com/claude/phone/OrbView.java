package com.claude.phone;

import android.animation.ValueAnimator;
import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RadialGradient;
import android.graphics.Shader;
import android.view.View;
import android.view.animation.LinearInterpolator;

public class OrbView extends View {

    public static final int IDLE = 0;
    public static final int LISTENING = 1;
    public static final int THINKING = 2;
    public static final int SPEAKING = 3;

    private int state = IDLE;
    private float t = 0f;

    private float cr = 200, cg = 185, cb = 155;
    private float tr = 200, tg = 185, tb = 155;

    private final Paint body = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint glow = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint accent = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Path shape = new Path();
    private ValueAnimator anim;

    private static final int[][] PAL = {
        {200, 185, 155},  // idle — stone
        {240, 200, 130},  // listening — amber
        {170, 145, 110},  // thinking — bronze
        {250, 235, 190},  // speaking — gold
    };

    public OrbView(Context context) {
        super(context);
        accent.setStyle(Paint.Style.STROKE);
        accent.setStrokeCap(Paint.Cap.ROUND);
        startAnim();
    }

    public void setState(int s) {
        if (state == s) return;
        state = s;
        tr = PAL[s][0]; tg = PAL[s][1]; tb = PAL[s][2];
    }

    public int getState() { return state; }

    private void startAnim() {
        anim = ValueAnimator.ofFloat(0, 1);
        anim.setDuration(16);
        anim.setRepeatCount(ValueAnimator.INFINITE);
        anim.setInterpolator(new LinearInterpolator());
        anim.addUpdateListener(new ValueAnimator.AnimatorUpdateListener() {
            @Override
            public void onAnimationUpdate(ValueAnimator a) {
                float speed;
                switch (state) {
                    case LISTENING: speed = 0.05f; break;
                    case THINKING:  speed = 0.07f; break;
                    case SPEAKING:  speed = 0.04f; break;
                    default:        speed = 0.012f;
                }
                t += speed;
                cr += (tr - cr) * 0.06f;
                cg += (tg - cg) * 0.06f;
                cb += (tb - cb) * 0.06f;
                invalidate();
            }
        });
        anim.start();
    }

    public void destroy() { if (anim != null) anim.cancel(); }

    @Override
    protected void onDraw(Canvas c) {
        float w = getWidth(), h = getHeight();
        float cx = w / 2f, cy = h / 2f;
        int r = (int) cr, g = (int) cg, b = (int) cb;

        float baseR, wobble;
        int pts;

        switch (state) {
            case LISTENING:
                baseR = w * 0.34f + sin(t * 2.5f) * w * 0.04f;
                wobble = w * 0.07f;
                pts = 128;
                break;
            case THINKING:
                baseR = w * 0.26f + sin(t * 1.5f) * w * 0.01f;
                wobble = w * 0.025f;
                pts = 96;
                break;
            case SPEAKING:
                baseR = w * 0.30f + sin(t * 3.5f) * w * 0.05f;
                wobble = w * 0.08f;
                pts = 128;
                break;
            default:
                baseR = w * 0.24f + sin(t * 0.6f) * w * 0.015f;
                wobble = w * 0.012f;
                pts = 72;
        }

        // Outer glow
        float gr = baseR + w * 0.18f;
        int glowA = state == LISTENING ? 35 : state == SPEAKING ? 30 : 15;
        glow.setShader(new RadialGradient(cx, cy, gr,
                Color.argb(glowA, r, g, b), Color.argb(0, r, g, b),
                Shader.TileMode.CLAMP));
        c.drawCircle(cx, cy, gr, glow);

        // Body
        shape.reset();
        for (int i = 0; i <= pts; i++) {
            float a = (float)(i * Math.PI * 2.0 / pts);
            float n = sin(a * 3 + t * 2.2f) * wobble * 0.5f
                    + sin(a * 5 + t * 1.6f) * wobble * 0.3f
                    + sin(a * 7 + t * 3.0f) * wobble * 0.2f;
            float rad = baseR + n;
            float x = cx + cos(a) * rad;
            float y = cy + sin(a) * rad;
            if (i == 0) shape.moveTo(x, y); else shape.lineTo(x, y);
        }
        shape.close();

        int rH = Math.min(r + 45, 255), gH = Math.min(g + 35, 255), bH = Math.min(b + 25, 255);
        body.setShader(new RadialGradient(
                cx - baseR * 0.3f, cy - baseR * 0.35f, baseR * 1.3f,
                new int[]{
                    Color.argb(240, rH, gH, bH),
                    Color.argb(160, r, g, b),
                    Color.argb(60, r / 2, g / 2, b / 2)
                },
                new float[]{0f, 0.55f, 1f},
                Shader.TileMode.CLAMP));
        c.drawPath(shape, body);

        // Listening: pulse rings
        if (state == LISTENING) {
            accent.setStrokeWidth(w * 0.008f);
            for (int i = 0; i < 3; i++) {
                float phase = (t * 1.8f + i * 2.1f) % 6.28f;
                float scale = 1f + sin(phase) * 0.35f;
                float alpha = 0.4f * Math.max(0, 1f - (scale - 1f) / 0.35f);
                if (alpha > 0.02f) {
                    accent.setColor(Color.argb((int)(alpha * 255), r, g, b));
                    c.drawCircle(cx, cy, baseR * scale, accent);
                }
            }
        }

        // Thinking: orbiting arcs
        if (state == THINKING) {
            accent.setStrokeWidth(w * 0.015f);
            accent.setColor(Color.argb(160, Math.min(r + 40, 255), Math.min(g + 30, 255), b));
            c.drawArc(cx - baseR * 0.5f, cy - baseR * 0.5f,
                      cx + baseR * 0.5f, cy + baseR * 0.5f, deg(t * 2.5f), 180f, false, accent);
            accent.setStrokeWidth(w * 0.01f);
            accent.setColor(Color.argb(100, r, g, b));
            c.drawArc(cx - baseR * 0.32f, cy - baseR * 0.32f,
                      cx + baseR * 0.32f, cy + baseR * 0.32f, -deg(t * 3.5f), 120f, false, accent);
        }

        // Speaking: ripples
        if (state == SPEAKING) {
            accent.setStrokeWidth(w * 0.006f);
            for (int i = 0; i < 4; i++) {
                float wr = baseR * 0.2f + ((t * 28 + i * 16) % (baseR * 0.75f));
                float alpha = 0.25f * (1f - wr / (baseR * 0.95f));
                if (alpha > 0) {
                    accent.setColor(Color.argb((int)(alpha * 255),
                            Math.min(r + 25, 255), Math.min(g + 20, 255), b));
                    c.drawCircle(cx, cy, wr, accent);
                }
            }
        }
    }

    private static float sin(float x) { return (float) Math.sin(x); }
    private static float cos(float x) { return (float) Math.cos(x); }
    private static float deg(float rad) { return (float) Math.toDegrees(rad); }
}
