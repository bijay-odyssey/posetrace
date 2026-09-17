import type { Template } from '../pose/types';

type Props = {
  url: string;
  blob: Blob | null;
  score: number | null;
  ready: boolean;
  /** Per-person scores for a group template (-1 = that slot was empty); empty for a single-person match. */
  perScore: number[];
  template: Template | null;
  onRetake: () => void;
};

async function saveOrShare(blob: Blob) {
  const file = new File([blob], `posetrace-${Date.now()}.jpg`, { type: 'image/jpeg' });
  const nav = navigator as Navigator & { canShare?: (d: unknown) => boolean };
  if (nav.canShare?.({ files: [file] }) && navigator.share) {
    try {
      await navigator.share({ files: [file] });
      return;
    } catch {
      /* user cancelled or share failed - fall through to download */
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function ReviewScreen(props: Props) {
  // Group template: show the per-person breakdown (matches the live HUD's own
  // convention) instead of silently collapsing "1 of 3 people" into one number.
  const breakdown = props.perScore.length > 1 ? props.perScore.map((n) => (n < 0 ? '–' : n)).join(' · ') : null;
  const label = props.ready ? 'Matched' : (breakdown ?? (props.template?.name || 'match'));

  return (
    <div class="review">
      <div class="review-photo">
        <img src={props.url} alt="captured photo" />
        {props.score != null && (
          <div class={`review-badge${props.ready ? ' ready' : ''}`}>
            {props.template?.thumb && <img class="review-badge-thumb" src={props.template.thumb} alt="" />}
            <span class="review-badge-text">
              <b>{props.score}%</b>
              <small>{label}</small>
            </span>
          </div>
        )}
      </div>
      <div class="actions">
        <button onClick={props.onRetake}>Retake</button>
        <button
          class="primary"
          disabled={!props.blob}
          onClick={() => props.blob && saveOrShare(props.blob)}
        >
          Save / Share
        </button>
      </div>
    </div>
  );
}
