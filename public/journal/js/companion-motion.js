/* Motion only: original artwork, body proportions and scene anchors stay in CatActor. */
__fluffyModules["companion-motion.js"] = (() => {
    "use strict";
    const keys = ["listen", "think", "talk", "wave", "nod", "greet"];
    const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
    const ease = x => { x = clamp(x); return x * x * (3 - 2 * x); };
    // An action has an approach, a short hold and a release, followed by a rest.
    const beat = (time, period, start, end) => {
        const phase = ((time % period) + period) % period;
        return ease((phase - start) / .5) * (1 - ease((phase - end) / .65));
    };
    class Controller {
        constructor() { this.channels = Object.fromEntries(keys.map(key => [key, { value: 0, velocity: 0 }])); }
        step(dt, targets) {
            const t = clamp(Number.isFinite(dt) ? dt : 0, 0, .06), omega = 10;
            for (const key of keys) {
                const channel = this.channels[key], target = clamp(targets[key] || 0);
                // Exact critically damped spring: retarget without resetting velocity or pose.
                const displacement = channel.value - target;
                const c = channel.velocity + omega * displacement, decay = Math.exp(-omega * t);
                channel.value = target + (displacement + c * t) * decay;
                channel.velocity = (channel.velocity - omega * c * t) * decay;
            }
            return this.values();
        }
        values() { return Object.fromEntries(keys.map(key => [key, clamp(this.channels[key].value)])); }
    }
    function pose(scene, clock, values, { reduced = false, pet = 0 } = {}) {
        const review = scene === "review", time = reduced ? 0 : clock;
        const { listen = 0, think = 0, talk = 0, wave = 0, nod = 0, greet = 0 } = reduced ? {} : values;
        const rest = clamp(1 - listen - think - talk - greet);
        const breathe = reduced ? 0 : Math.sin(time * 1.35);
        const gesture = beat(time, 5.8, .65, 2.1);
        const acknowledge = beat(time, 7.4, 3.1, 4.2) * Math.sin((time - 3.1) * 3.4);
        const syllable = (.5 + .5 * Math.sin(time * 7.1)) * (.65 + .35 * Math.sin(time * 2.3) ** 2);
        return {
            t: 0, idle: time, sleep: review ? .82 : 0,
            // Keep the head's original resting shape/scale. Attention uses rigid motion.
            headSleep: review ? .71 : 0, tailSleep: review ? .91 : 0,
            pen: null, grip: review ? [140, 410] : [177, 405], release: 1,
            lookOverride: (review ? .12 : .08) + .2 * listen - .14 * think + (reduced ? 0 : .09 * rest * Math.sin(time * .65)),
            headTilt: clamp(-.085 * listen + .075 * think + .035 * (nod + talk * .35 + greet) * acknowledge + (reduced ? 0 : .03 * rest * Math.sin(time * .8)), -.11, .11),
            headLift: reduced ? 0 : 7 * listen + 2.2 * think + 1.8 * talk + 1.2 * breathe,
            attention: 0, thought: 0, pet: reduced ? 0 : clamp(pet), chatMotion: true,
            pawLift: reduced ? 0 : clamp((.55 * talk + .3 * wave + .72 * greet) * gesture + .18 * listen * beat(time, 7.4, 3.1, 4.2) + .2 * pet, 0, .85),
            mouthTalk: reduced ? 0 : talk * (0.2 + 1.8 * syllable),
            tailSwing: reduced ? 0 : ((review ? 5.5 : 2.5) + 1.3 * listen) * Math.sin(time * 1.05 - .6),
        };
    }
    return { Controller, pose };
})();
