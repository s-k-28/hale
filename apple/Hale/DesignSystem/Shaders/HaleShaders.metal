// HALE signature Metal shaders — driven by SwiftUI's .colorEffect (iOS 17+).
// Kept deliberately restrained: they *add light*, they never repaint. Each is
// time-driven from a TimelineView on the Swift side (see ShaderFX.swift) and is
// suppressed entirely under Reduce Motion.
#include <metal_stdlib>
#include <SwiftUI/SwiftUI.h>
using namespace metal;

// Wrap an angle delta into -pi…pi so the highlight band crosses the 0/2π seam
// without a flicker.
static inline float wrapPi(float a) {
    return atan2(sin(a), cos(a));
}

// haleRingShimmer — a specular highlight that travels around a stroked ring.
// Applied to the progress arc via .colorEffect: it only touches drawn pixels
// (color.a > 0), so the ring keeps its emerald gradient and simply gains a soft
// bright band sweeping around it — a living, gently rotating sheen.
[[ stitchable ]]
half4 haleRingShimmer(float2 pos, half4 color, float2 size, float time) {
    if (color.a < 0.01h) { return color; }              // ring stroke only

    float2 c   = size * 0.5;
    float2 d   = pos - c;
    float  ang = atan2(d.y, d.x);                        // -pi…pi around center
    float  head = time * 1.15;                           // sweep speed
    float  da  = wrapPi(ang - head);

    // narrow leading crest + a longer, fainter trailing comet tail
    float crest = smoothstep(0.85, 0.0, abs(da));
    float tail  = smoothstep(2.4, 0.0, max(0.0, da)) * 0.35;
    float glow  = clamp(crest + tail, 0.0, 1.0) * 0.55;

    // add light on the premultiplied stroke; alpha unchanged
    return half4(color.rgb + half3(half(glow)), color.a);
}

// haleAura — a soft, slow, drifting glow field. Two low-frequency lobes wander on
// gentle sines, haloed toward the top and faded before the lower CTAs. Used for
// the SOS calming field (coral) and the milestone hero glow (emerald). Returns a
// premultiplied tinted color; f is tiny by design — this is atmosphere, not a light show.
[[ stitchable ]]
half4 haleAura(float2 pos, half4 color, float2 size, float time, half4 tint, float intensity) {
    float2 uv = pos / size;                              // 0…1
    float2 p  = uv - 0.5;
    p.x *= size.x / size.y;                              // aspect correct

    // two slowly drifting centers (kept in the upper half)
    float2 a = float2(sin(time * 0.23) * 0.18, cos(time * 0.19) * 0.12 - 0.14);
    float2 b = float2(cos(time * 0.17) * 0.20, sin(time * 0.21) * 0.14 - 0.02);

    float lobeA = smoothstep(0.62, 0.0, length(p - a)) * 0.60;
    float lobeB = smoothstep(0.55, 0.0, length(p - b)) * 0.50;

    // slow global breath so the whole field inhales/exhales
    float breath = 0.85 + 0.15 * sin(time * 0.6);
    // vertical veil — strong up top, gone by the bottom third
    float veil = smoothstep(1.0, 0.22, uv.y);

    float f = (lobeA + lobeB) * breath * veil * intensity;
    f = clamp(f, 0.0, 1.0);

    return half4(tint.rgb * half(f), half(f));           // premultiplied
}
