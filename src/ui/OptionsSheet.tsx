import type { GhostStyle, LoopSettings } from '../hooks/usePoseLoop';

type Props = {
  settings: LoopSettings;
  onChange: (patch: Partial<LoopSettings>) => void;
  preview3d: boolean;
  onPreview3d: (v: boolean) => void;
  canPreview3d: boolean;
  onClose: () => void;
};

const GHOST_STYLES: Array<{ id: GhostStyle; label: string }> = [
  { id: 'both', label: 'Both' },
  { id: 'silhouette', label: 'Silhouette' },
  { id: 'skeleton', label: 'Skeleton' },
];

export function OptionsSheet(props: Props) {
  const { settings, onChange } = props;
  return (
    <div class="sheet-backdrop" onClick={props.onClose}>
      <div class="sheet" onClick={(e) => e.stopPropagation()}>
        <h2>Options</h2>

        <div class="opt">
          <span>Ghost style</span>
          <div class="seg">
            {GHOST_STYLES.map((g) => (
              <button
                key={g.id}
                class={settings.ghostStyle === g.id ? 'on' : ''}
                onClick={() => onChange({ ghostStyle: g.id })}
              >
                {g.label}
              </button>
            ))}
          </div>
        </div>

        <label class="opt">
          <span>Grid</span>
          <input
            type="checkbox"
            checked={settings.showGrid}
            onChange={(e) => onChange({ showGrid: (e.currentTarget as HTMLInputElement).checked })}
          />
        </label>

        <label class="opt">
          <span>Mirror</span>
          <input
            type="checkbox"
            checked={settings.mirror}
            onChange={(e) => onChange({ mirror: (e.currentTarget as HTMLInputElement).checked })}
          />
        </label>

        <label class="opt">
          <span>Auto shutter</span>
          <input
            type="checkbox"
            checked={settings.autoShutter}
            onChange={(e) => onChange({ autoShutter: (e.currentTarget as HTMLInputElement).checked })}
          />
        </label>

        <label class="opt">
          <span>Hand tracking</span>
          <input
            type="checkbox"
            checked={settings.handTracking}
            onChange={(e) => onChange({ handTracking: (e.currentTarget as HTMLInputElement).checked })}
          />
        </label>

        <label class="opt">
          <span>Burn overlay into photo</span>
          <input
            type="checkbox"
            checked={settings.burnOverlay}
            onChange={(e) => onChange({ burnOverlay: (e.currentTarget as HTMLInputElement).checked })}
          />
        </label>

        <label class="opt">
          <span>3D pose preview</span>
          <input
            type="checkbox"
            checked={props.preview3d}
            disabled={!props.canPreview3d}
            onChange={(e) => props.onPreview3d((e.currentTarget as HTMLInputElement).checked)}
          />
        </label>

        <label class="opt col">
          <span>Match sensitivity: ready at {settings.readyScore}%</span>
          <input
            type="range"
            min={60}
            max={95}
            value={settings.readyScore}
            onInput={(e) =>
              onChange({ readyScore: Number((e.currentTarget as HTMLInputElement).value) })
            }
          />
        </label>

        <button onClick={props.onClose}>Done</button>
      </div>
    </div>
  );
}
