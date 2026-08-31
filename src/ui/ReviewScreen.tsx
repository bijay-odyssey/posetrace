type Props = {
  url: string;
  blob: Blob | null;
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
  return (
    <div class="review">
      <img src={props.url} alt="captured photo" />
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
