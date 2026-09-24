# sillage sea footer

Provenance: the idea has been open since 2026-08-21 ("我想在这里画一条海和船"),
scoped against three reference sites (chloeyan.me, tinycamp.site,
baothiento.com) and one mockup drawn by the owner. Three flat procedural
attempts were rejected as not hand-drawn enough; the owner then asked for a
side-on cross-section of sea and sailboat ("2 维剖面的 海+帆船"), moving.

## State

**Built, on `feat/blog-sea-footer`, awaiting the owner's eye.**

- Art: `scripts/paint-sillage.ts` paints it as crayon on toothed paper —
  pigment deposited where stroke pressure beats the paper's height field, over a
  toned, mottled ground — in both themes, from `blogPalette`. The first crayon
  pass (2026-09-24) read as white static and was redone: the fix was a toned
  ground so gaps show lighter blue, not paper, and a soft deposit band.
- Composition follows the mockup: sea profile against the page, small cumulus,
  a back swell for depth instead of a horizon. An earlier horizon-and-far-sea
  version contradicted the cross-section brief and was dropped.
- Motion: the water drifts, the boat rides the painted swell, the wake is foam
  left on the water. Night lights the stern lantern (the colophon's "深夜里独自
  点亮的灯").
- Second pass (2026-09-24, owner: "把海和浪做的更精致一点 并且加一点交互设计还有
  更多的动作感"): whitecaps on the tallest crests, a front row of waves for
  depth, rows that breathe, a bow wave driven by the pitch, and touch — tap to
  splash, drag sideways to move the sea with the finger. A diagonal hatch over
  the water and per-wave shoulder strokes were tried and dropped: both turned
  the sea grey and busy.
- Third pass (2026-09-24, owner: "滚动到底之后 继续触发 scrolling 的效果 … 浪花海水的
  音效 … 和之前的文字 footer 配合好一点"): scroll carries on into the sea at the
  end of the page, the layers part in depth as the band scrolls in, the site
  footer sits in the sea's sky, and CC0 surf, hull wash and splash recordings
  answer touch and scroll.
- Fourth pass (2026-09-24, owner: "在页面底部往下滚还是会露出白色的底部 … 音效没有
  关闭的按钮 … 拖动这个船好像也没有交互 … 能不能搞个海豚 … 黄昏时的大海 根据用户浏览
  器时间判定"): the rubber band past the sea is gone, a sound switch sits in the
  sky, the boat can be picked up and thrown, dolphins, fish, gulls and stars
  answer touches, and a dusk sea comes up on the reader's evening clock.
- Fifth pass (2026-09-24, owner: "海豚太频繁了 … 蓝调时刻和黄昏的效果还可以再优化"):
  dolphins are rare after the first; the dusk sky is painted instead of a CSS
  gradient, which over black paper went brown; the sun has a haze and a longer
  road; blue hour trades its gold crests for lilac and gets indigo clouds. A
  moon and first stars were tried and dropped at the owner's word ("太丑了"),
  and so was crayon across the whole sky: it read as blur and seamed against
  the page. Less is more — one eased wash, crayon only on the horizon.

## Decisions taken without the owner

- **Voyage, not mooring.** The boat holds its place on the page while the sea
  moves under it, and it leaves a wake. The alternative was a moored boat
  bobbing in place; a boat that leaves no sillage contradicts the name.
- **Blue flag, not the mockup's red.** The blog forbids warm accents. The flag
  is 霁 (`ji`), the one fill-only ink. Red is a one-line palette change in the
  script if the owner wants the mockup back.
- **Blue boat, not the mockup's brown hull and cream sails.** Same rule.
- **Dragging can stop the sea but not reverse it.** Running the loop backwards
  would sail the boat astern into her own wake.
- **Silent until touched.** Scrolling to the sea never starts sound; the
  first touch of the water does, and it fades five seconds after the reader
  stops. The owner then asked for an off switch as well; it is remembered.
- **Dusk is a fixed window, 17:00–19:30 local.** The page knows the time, not
  the place, so it cannot know the real sunset. The constants are in the
  component script.
- **Dusk is warm.** The blog's no-warm-accents rule gives way here only, at the
  owner's asking; the flag stays 霁.
- **No rubber band on /blog.** `overscroll-behavior-y: none` on the page
  scroller wherever the sea is. The top of the page loses its bounce too.
- **The boat blocks scrolling where she stands.** A touch on her box never
  scrolls, so she can be lifted in any direction on a phone.
- **Scroll only adds speed.** Scrolling back up does not slow or reverse the
  sea; it just stops feeding it.
- **No crest curls.** Tried on the front row; at this scale they read as stray
  white squiggles, not breaking water.

## Remaining

- [ ] Owner review of the art, light and dark, desktop and phone.
- [ ] Move this file to `notes/archive/` when the branch merges.
