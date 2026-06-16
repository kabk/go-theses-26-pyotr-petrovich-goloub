gsap.registerPlugin(ScrollTrigger);

const DEBUG_SCROLL_DRAW = false;
const SHAPE_SELECTOR = 'path, rect, line, polyline, polygon, circle, ellipse';
const HOTSPOT_CLASS = 'footnote-hotspot';
const UNSUPPORTED_SELECTOR = 'image, use, text, foreignObject';

function logDebug(...args) {
    if (!DEBUG_SCROLL_DRAW) return;
    console.log('[scroll-draw]', ...args);
}

function getShapeLength(shape) {
    if (typeof shape.getTotalLength === 'function') {
        try {
            const length = shape.getTotalLength();
            if (Number.isFinite(length) && length > 0) {
                return length;
            }
        } catch (error) {
            logDebug('gettotallength failed', shape.tagName, error);
        }
    }

    return 100;
}

function getShapeDurationFromLength(length) {
    return Math.min(220, Math.max(8, length));
}

async function inlineSVGImage(img, index) {
    const src = img.getAttribute('src') || '';
    const response = await fetch(src);
    if (!response.ok) {
        throw new Error(`failed to fetch ${src} (${response.status})`);
    }

    const text = await response.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(text, 'image/svg+xml');
    const svg = doc.querySelector('svg');

    if (!svg) {
        throw new Error(`no <svg> found in ${src}`);
    }

    Array.from(img.attributes).forEach((attr) => {
        if (attr.name !== 'src' && attr.name !== 'alt') {
            svg.setAttribute(attr.name, attr.value);
        }
    });

    const removedUnsupported = svg.querySelectorAll(UNSUPPORTED_SELECTOR).length;
    svg.querySelectorAll(UNSUPPORTED_SELECTOR).forEach((node) => node.remove());

    svg.dataset.scrollDrawIndex = String(index + 1);
    svg.dataset.scrollDrawSource = src;

    // keep hotspots visible immediately; they should never depend on draw order
    const immediateHotspots = Array.from(svg.querySelectorAll(`.${HOTSPOT_CLASS}`));
    if (immediateHotspots.length) {
        gsap.set(immediateHotspots, {
            opacity: 1,
            fillOpacity: 1,
            strokeOpacity: 1,
            strokeDasharray: 'none',
            strokeDashoffset: 0
        });
    }

    img.replaceWith(svg);

    return { svg, src, index, removedUnsupported };
}

function createHandwritingTimeline(record) {
    const { svg, src, index, removedUnsupported } = record;
    const section = svg.closest('section');

    if (!section) {
        logDebug('missing section', src);
        return;
    }

    const shapes = Array.from(svg.querySelectorAll(SHAPE_SELECTOR)).filter((shape) => {
        return !shape.closest('defs, symbol, clipPath, mask, pattern');
    });

    const hotspotShapes = shapes.filter((shape) => shape.classList.contains(HOTSPOT_CLASS));
    const drawableShapes = shapes.filter((shape) => !shape.classList.contains(HOTSPOT_CLASS));

    if (!shapes.length) {
        logDebug('no drawable shapes', src);
        return;
    }

    if (hotspotShapes.length) {
        // keep footnote hotspots visible immediately instead of waiting in draw order
        gsap.set(hotspotShapes, {
            opacity: 1,
            fillOpacity: 1,
            strokeOpacity: 1,
            strokeDasharray: 'none',
            strokeDashoffset: 0
        });
    }

    if (!drawableShapes.length) {
        logDebug('hotspots only, skipping draw timeline', src);
        return;
    }

    const svgName = src.split('/').pop() || `svg-${index + 1}`;
    const triggerId = `svg-${index + 1}-${svgName}`;

    const tl = gsap.timeline({
        defaults: {
            ease: 'none'
        },
        scrollTrigger: {
            id: triggerId,
            trigger: section,
            start: 'top 75%',
            end: 'bottom 85%',
            scrub: true,
            markers: false,
            invalidateOnRefresh: false
        }
    });

    gsap.set(drawableShapes, {
        strokeOpacity: 0
    });

    const preparedShapes = drawableShapes.map((shape) => {
        const length = getShapeLength(shape);
        shape.style.strokeDasharray = String(length);
        shape.style.strokeDashoffset = String(length);
        return {
            shape,
            duration: getShapeDurationFromLength(length)
        };
    });

    preparedShapes.forEach(({ shape, duration }) => {
        tl.to(shape, {
            strokeOpacity: 1,
            strokeDashoffset: 0,
            duration
        });
    });

    logDebug('created', triggerId, {
        source: src,
        shapeCount: drawableShapes.length,
        hotspotCount: hotspotShapes.length,
        removedUnsupported,
        sectionTop: Math.round(section.getBoundingClientRect().top + window.scrollY),
        sectionHeight: Math.round(section.getBoundingClientRect().height)
    });
}

function waitFrames(count) {
    return new Promise((resolve) => {
        let remaining = count;

        function step() {
            remaining -= 1;
            if (remaining <= 0) {
                resolve();
                return;
            }
            requestAnimationFrame(step);
        }

        requestAnimationFrame(step);
    });
}

function logTriggerSnapshot() {
    if (!DEBUG_SCROLL_DRAW) return;

    const snapshot = ScrollTrigger.getAll().map((trigger) => ({
        id: trigger.vars.id || 'unnamed',
        start: Math.round(trigger.start),
        end: Math.round(trigger.end),
        progress: Number(trigger.progress.toFixed(3))
    }));

    logDebug('after-refresh', snapshot);
}

function forceScrollToTop() {
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
}

async function initScrollDraw() {
    const images = Array.from(document.querySelectorAll('.paragraph img[src$=".svg"]'));

    logDebug('init', {
        imageCount: images.length,
        scrollY: Math.round(window.scrollY),
        viewportHeight: window.innerHeight
    });

    const records = (await Promise.all(images.map(async (img, index) => {
        try {
            return await inlineSVGImage(img, index);
        } catch (error) {
            console.error('[scroll-draw] failed to inline svg:', img.getAttribute('src'), error);
            return null;
        }
    }))).filter(Boolean);

    await waitFrames(2);

    records.forEach((record) => {
        try {
            createHandwritingTimeline(record);
        } catch (error) {
            console.error('[scroll-draw] failed to create timeline:', record.src, error);

            // if drawing fails for a section, keep it visible instead of blocking the whole experience
            const fallbackShapes = Array.from(record.svg.querySelectorAll(SHAPE_SELECTOR)).filter((shape) => {
                return !shape.closest('defs, symbol, clipPath, mask, pattern');
            });

            gsap.set(fallbackShapes, {
                fillOpacity: 1,
                strokeOpacity: 1,
                strokeDashoffset: 0
            });
        }
    });

    ScrollTrigger.refresh();
    logTriggerSnapshot();
}

function setupIntroOverlay() {
    const intro = document.getElementById('intro');
    const button = document.getElementById('start-reading');

    if (!intro || !button) {
        return null;
    }

    document.body.style.overflow = 'hidden';
    forceScrollToTop();
    button.disabled = true;
    button.textContent = 'writting...';

    const waitForStart = new Promise((resolve) => {
        button.addEventListener('click', () => {
            forceScrollToTop();
            intro.classList.add('is-leaving');
            document.body.style.overflow = '';
            requestAnimationFrame(forceScrollToTop);

            const removeIntro = () => {
                intro.remove();
                resolve();
            };

            intro.addEventListener('transitionend', removeIntro, { once: true });
            setTimeout(removeIntro, 900);
        }, { once: true });
    });

    return {
        unlock() {
            button.disabled = false;
            button.textContent = 'start reading';
        },
        waitForStart
    };
}

async function initExperience() {
    if ('scrollRestoration' in history) {
        history.scrollRestoration = 'manual';
    }

    forceScrollToTop();
    const introOverlay = setupIntroOverlay();

    try {
        await initScrollDraw();
    } catch (error) {
        console.error('[scroll-draw] init failed, continuing with static svg:', error);
    }

    if (!introOverlay) {
        return;
    }

    introOverlay.unlock();
    await introOverlay.waitForStart;
}

document.addEventListener('DOMContentLoaded', () => {
    initExperience().catch((error) => {
        console.error('[scroll-draw] unexpected init error:', error);
    });

    // Generative title animation (marquee)
    let titleStr = " choo choo                              ";
    let trainCooldown = 40;
    let charQueue = [];

    setInterval(() => {
        const trackChars = ['_', '_', '_', '_', '_', '_', '_', '_', '_', '_', '_', '_', '_', '_', '_', '_', '_', '_', '_', '_', '_', 'o', 'ф', 'Y'];
        let nextChar = '';
        
        if (charQueue.length > 0) {
            nextChar = charQueue.shift();
        } else {
            if (trainCooldown > 0) {
                trainCooldown--;
                // ensure we don't pick the empty string from trackChars if we need exactly 1 char step, 
                // but if we do, it acts as a space or just doesn't move it. Let's use a safe fallback:
                nextChar = trackChars[Math.floor(Math.random() * trackChars.length)] || ' '; 
            } else {
                // Time for a train! We reverse it so it feeds out correctly when prepending
                charQueue = " Choo Choo ".split('').reverse();
                nextChar = charQueue.shift();
                trainCooldown = Math.floor(Math.random() * 40) + 40; // Wait 40-80 ticks before next train
            }
        }
        
        titleStr = nextChar + titleStr.substring(0, titleStr.length - nextChar.length);
        document.title = titleStr;
    }, 250);
});
