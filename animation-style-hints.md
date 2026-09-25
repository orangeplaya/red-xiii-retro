OVERVIEW
- A ~99s pixel-art short, structured like the "growing up walk" in hakuna-matata-walk-analysis.md. A red-furred lion-wolf hero walks in place, side-on, while three red-rock canyon environments scroll past behind him. He is climbing toward the canyon summit, where his father stands turned to stone under a full moon. The final beat is the climax and the end of the film.
- The hero and the father are ORIGINAL designs. This is a new character in a similar spirit, not a recreation of any existing game character. See CHARACTERS for the design.
- The soundtrack is combined-sequences-1.mp3. It is added to the rendered mp4 afterward, so the visual timeline must line up with the audio as described in TIMELINE.

RENDERING
- Draw everything to an offscreen canvas at a fixed logical resolution of 128x96, then blit to a fullscreen display canvas scaled by the largest integer factor that fits the window, centered, with imageSmoothingEnabled = false and CSS image-rendering: pixelated.
- All drawing snaps to integer coordinates on the logical canvas. No sub-pixel positions, anti-aliasing, smooth gradients, or shadowBlur.
- Sky and light falloff use ordered dithering (a 2x2 or 4x4 Bayer checkerboard between two adjacent palette colors), not smooth gradients. Use horizontal dither bands like the sky in pixel-img-example.png.
- Fixed palette of ~32 hex colors, split into per-sequence sub-palettes (see ENVIRONMENTS). Every pixel comes from the master palette.

CHARACTERS
- Hero: a lean, four-legged lion-wolf with crimson/rust fur, a lighter tan belly and muzzle, and a short swept-back crest of spiky hair on the head that runs as a ridge down the spine. He wears a single gold bead cuff on each foreleg and a braided cord with two gold beads hanging from the neck. He has pale amber eyes and a long, thin tail that ends in a living flame (see TAIL FLAME). No other markings or accessories, so the design stays his own. The sprite is about 28-32 logical px long and 18-22 px tall, facing right.
- Build the hero from filled rects and pixel runs. Use a 1px darker-red outline on the silhouette and 2-3 fur shades (shadow, base, highlight).
- Parameterize the four legs (a 4-beat walk cycle), head bob, crest and spine-hair sway, tail swing, and neck-bead swing. Animate the parameters smoothly, then quantize to the pixel grid each frame so motion reads at an 8-12 fps pixel feel. Beads and hair tips should lag the body by 1-2 animation frames (secondary motion).
- TAIL FLAME: a small flame, about 5-7 px tall and 4-5 px wide, anchored to the tail tip. It uses its own 4-color ramp: white-yellow core, gold, orange, and deep red at the outer edge.
  - Shape: build it each frame from a stack of 1px rows whose widths come from a few layered sine waves of t, quantized to pixels. Update the flame shape at about 12 fps, so it flickers faster than the 8-10 fps walk cycle.
  - Motion drag: the tail swing moves the anchor point. The flame leans opposite the direction of anchor motion, plus a constant lean backward (left) because the hero is walking forward, so it trails like a torch being carried.
  - Embers: a preallocated pool of about 12 ember particles. Every few frames, one spawns from the flame tip, drifts up and left (with the ground scroll), fades through the ramp from orange to red to dark red, and dies after 0.5-1.0s. Draw embers as single pixels.
  - Light: the flame casts a small warm pool on nearby pixels. Tint 2-3 px of the tail and hindquarter fur one step toward orange with a dithered falloff. In Sequence 1 this is barely visible. It becomes a clear accent in Sequence 2. In Sequence 3, the flame is the only warm color on the silhouetted hero, a spot of warmth against the cold teal moonlight. It also lights a faint dithered glow on the ground under the tail tip.
  - Beat C: when the hero stops before the statue, the flame settles to a slower, taller, calmer flicker (about 6 fps, less lean).
- Father statue: the same species, larger and older, with a heavier mane. He stands rigid in a defiant pose on a rock spur, rendered only in grey/blue-grey stone tones with a few cracks. Several broken spear shafts jut from the rock around him and from his flank (thin 1px dark diagonal lines). He is revealed only in Sequence 3.

TIMELINE (locked to combined-sequences-1.mp3, total 98.97s)
- The audio uses 1.5s crossfades. The visual cuts happen as 1.5s dithered dissolves over the same windows.
- Sequence 1: 0.00s - 27.53s, then a dissolve from 27.53s to 29.03s
- Sequence 2: 29.03s - 49.02s, then a dissolve from 49.02s to 50.52s
- Sequence 3: 50.52s - 98.97s (end)
- Dissolve method: blend the outgoing and incoming frames through a 4x4 Bayer threshold mask that advances over the 1.5s. It is a per-pixel pick, not an alpha blend, so the palette stays pure.
- Time is the source of truth. Every frame is a pure function of t (seconds), so the same code can play live or render deterministically to video.

STAGING (constant across all sequences, per the hakuna matata template)
- Locked side-on camera. The hero walks in place at horizontal center (x of about 50-64), and his feet sit on a ground line at about y=70.
- The ground plane is a single horizontal ledge the hero walks along. Its surface changes per sequence, and it scrolls left in sync with the walk cycle so the feet don't slide.
- Parallax layers, back to front: sky (static or very slow), far cliffs (0.1x), mid cliffs and props (0.35x), ground ledge (1.0x), foreground plane (1.6x). The foreground plane is dark, near-silhouette rock spires and dry grass that pass in front of the hero at the frame edges, the pixel equivalent of the blurred bokeh leaves in the reference.
- Stars are single white or pale-blue pixels. A few twinkle by swapping between 2 palette colors on a slow random-but-seeded schedule.

ENVIRONMENTS

Sequence 1 — Canyon floor, late afternoon (0s - ~28s)
- Sky: warm dithered bands from pale gold at the horizon up to soft orange, then dusty pink at the top.
- Far layer: tall layered mesas in terracotta and burnt orange, with horizontal strata lines (1px darker bands).
- Mid layer: cliff walls with small carved dwellings (dark doorways) and wooden ladders and plank walkways. There is also a tall wooden watch-post and a large bonfire with 3-4 frame flickering flames and a few rising ember pixels.
- Ground: sandy, packed-dirt path with scattered pebbles, dry scrub tufts and a few small cacti.
- Mood: home and warmth, the start of the journey.

Sequence 2 — Cliffside switchbacks and cave mouth, dusk (~28s - ~50s)
- Sky: shifts to a dusk palette with dithered bands from deep orange low to violet and indigo high. The first 2-3 stars appear.
- Far layer: the canyon drops away. We are higher now, with distant mesa tops in dusky purple-brown.
- Mid layer: a narrow ledge path hugging the cliff, rope railings, and dark cave openings with a faint cold teal glow inside, hinting at danger. Occasional carved stone markers or totems pass by.
- Ground: a narrow rock ledge with cracked stone. Where the ledge is exposed, the drop below shows as a darker dithered void.
- Light: rim-light the hero on his back edge with 1px of warm orange (the setting sun behind), and cool the front edge.
- Mood: ascent and quiet resolve.

Sequence 3 — The summit under the full moon (~50s - end, the climax)
- Sky: full night. Use deep navy to teal dithered bands, like the teal-blue tones in red-xiii-end-scene.jpg, with dense stars and 2-3 slow-drifting pixel cloud banks in blue-grey with lighter tops.
- Moon: a very large pale teal-white disc (about 36-44 px diameter) with 3-4 darker crater blotches. Surround it with a halo of 2-3 dithered rings in progressively darker teal to fake glow without blur. The moon rises from low behind the far cliffs to high-center over the first ~12s of the sequence.
- Beat A (about 50s - 75s): the walk continues along a rocky ridge. Silhouette lighting kicks in: the hero drops to 2 dark shades plus a 1px moonlit rim on his top edge. Ground: red-brown rock ridge, darkened toward silhouette.
- Beat B (about 75s - 88s): the father statue on its rock spur scrolls in from the right and settles centered, directly in front of the moon so it reads as a dark stone silhouette against the glowing disc. The ground scroll decelerates to a stop, and the hero's walk cycle eases to a standstill a short distance left of the statue.
- Beat C (about 88s - 98.97s): a camera tilt-up / parallax reveal. Shift all layers downward at their parallax rates (ground fastest, sky slowest) so the view appears to look up past the hero and statue toward the moon. The moon and statue end framed high-center. The hero raises his head toward the moon (a 2-3 frame head pose change). Hold on the final frame for the last ~2s, then fade to black through the dither mask over the last 1s.
- Mood: arrival, grief and reverence. This is the emotional peak.

ANIMATION & PERFORMANCE
- Live playback: fixed 60hz timestep update with rAF rendering. Zero object allocation inside the loop, with all buffers, palettes and sprite data preallocated.
- Offline render: expose a renderFrame(t) that draws the exact frame for time t. Capture at 30fps (2970 frames for 98.97s) at an integer upscale (for example 128x96 -> 1280x960 at 10x, nearest-neighbour), encode to mp4 (H.264, yuv420p), then mux combined-sequences-1.mp3 as the audio track.
- Keep the walk cycle and all ambient motion (bonfire and tail flames, embers, twinkles, clouds, bead swing). Seed any randomness from t or a fixed seed. driven by t so the offline render matches live playback frame-for-frame.

QUALITY BAR
- Crisp pixels at any window size, stable 60fps live, a readable silhouette in every sequence, and exact sync of the scene changes to the music crossfades. It should look like a polished 16-bit sprite cutscene, not vector shapes scaled down.
