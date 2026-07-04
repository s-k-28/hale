#include <metal_stdlib>
using namespace metal;

// Metal shaders for the cinematic onboarding. Compiled into the app's
// default.metallib automatically (xcodegen globs Hale/, Xcode compiles .metal),
// reachable from SwiftUI as ShaderLibrary.<name>(...). See StoryKit.swift.

// Flowing emerald caustics layered over a view's rendered content, used via
// SwiftUI .colorEffect. A subtle living light that plays across the reveal /
// commit money cards at the story's emotional peak.
//   colorEffect signature: half4 f(float2 position, half4 color, <args…>)
[[ stitchable ]] half4 emeraldAurora(float2 pos, half4 color, float2 size, float time) {
    if (color.a < 0.003h) return color;
    float2 uv = pos / max(size, float2(1.0, 1.0));
    // three drifting wave fields → soft moving bands of light
    float w = 0.0;
    w += sin(uv.x * 9.4 + time * 0.9);
    w += sin((uv.x + uv.y) * 7.0 - time * 0.7);
    w += sin(uv.y * 5.0 + time * 0.5) * 0.7;
    float band = 0.5 + 0.5 * sin(w * 1.6 + time * 0.6);
    band = pow(band, 2.4);                       // tighten to bright filaments
    half3 emerald = half3(0.38h, 0.96h, 0.71h);  // Tok.accent2-ish
    half glow = half(band) * 0.16h * color.a;    // gated by content alpha
    return half4(color.rgb + emerald * glow, color.a);
}

// Gentle heat-haze displacement (SwiftUI .distortionEffect) — the "haze"
// literally shimmering. `amount` eases to zero as the plan resolves.
//   distortionEffect signature: float2 f(float2 position, <args…>)
[[ stitchable ]] float2 hazeDistort(float2 pos, float time, float amount) {
    float dx = sin(pos.y * 0.045 + time * 1.3) * amount;
    float dy = cos(pos.x * 0.050 + time * 1.1) * amount * 0.6;
    return pos + float2(dx, dy);
}
