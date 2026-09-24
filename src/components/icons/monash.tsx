// The Monash crest, cut from the university logo on Wikimedia Commons. It is
// detailed line art, so it is drawn as a mask and takes the text colour. It
// runs a step larger than a stroke glyph of the same box, since the shield's
// fine lines read small.
export function MonashCrestIcon({ className }: { className?: string }) {
  return (
    <span
      className={className}
      aria-hidden="true"
      style={{
        display: 'inline-block',
        width: '20px',
        height: '22px',
        backgroundColor: 'currentColor',
        mask: "url('/brands/monash-crest.svg') center / contain no-repeat",
      }}
    />
  );
}
