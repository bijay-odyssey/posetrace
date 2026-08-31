import { useEffect, useRef } from 'preact/hooks';
import type { Template } from '../pose/types';
import { createPosePreview, type PosePreview } from '../three/posePreview';

type Props = {
  template: Template;
  onClose: () => void;
};

export function PosePreview3D({ template, onClose }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewRef = useRef<PosePreview | null>(null);
  const poseRef = useRef({ landmarks: template.landmarks, world: template.world });
  poseRef.current = { landmarks: template.landmarks, world: template.world };

  useEffect(() => {
    let disposed = false;
    void (async () => {
      if (!canvasRef.current) return;
      try {
        const preview = await createPosePreview(canvasRef.current, poseRef.current);
        if (disposed) {
          preview.dispose();
          return;
        }
        previewRef.current = preview;
      } catch {
        /* three failed to load - panel just stays blank */
      }
    })();
    return () => {
      disposed = true;
      previewRef.current?.dispose();
      previewRef.current = null;
    };
  }, []);

  useEffect(() => {
    previewRef.current?.setPose(template.landmarks, template.world);
  }, [template.id]);

  return (
    <div class="preview3d">
      <canvas ref={canvasRef} width={260} height={260} />
      <button class="preview3d-close" onClick={onClose} aria-label="Close 3D preview">
        &times;
      </button>
      <small>{template.world ? '3D pose' : '3D pose (flat)'}</small>
    </div>
  );
}
