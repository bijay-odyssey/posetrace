import { useRef } from 'preact/hooks';
import type { Template } from '../pose/types';

type Props = {
  templates: Template[];
  activeId: string | null;
  onPick: (id: string | null) => void;
  onDelete: (id: string) => void;
  onImportPhoto: (file: File) => void;
  onExport: () => void;
  onImportJson: (file: File) => void;
  onClose: () => void;
};

export function TemplateSheet(props: Props) {
  const photoInput = useRef<HTMLInputElement>(null);
  const jsonInput = useRef<HTMLInputElement>(null);

  const pickFile = (input: HTMLInputElement | null, cb: (f: File) => void) => {
    const f = input?.files?.[0];
    if (f) cb(f);
    if (input) input.value = '';
  };

  return (
    <div class="sheet-backdrop" onClick={props.onClose}>
      <div class="sheet" onClick={(e) => e.stopPropagation()}>
        <h2>Reference pose</h2>

        <div class="row">
          <button class="cta" onClick={() => photoInput.current?.click()}>
            + Import from photo
          </button>
          <button onClick={() => props.onPick(null)}>No reference</button>
        </div>

        {props.templates.length === 0 ? (
          <p class="muted">
            Import a photo of a pose you like. The app extracts its skeleton and projects it onto
            the camera so you can match it.
          </p>
        ) : (
          <div class="grid">
            {props.templates.map((t) => (
              <button
                key={t.id}
                class={`tpl${t.id === props.activeId ? ' active' : ''}`}
                onClick={() => props.onPick(t.id)}
              >
                {t.thumb ? <img src={t.thumb} alt={t.name} /> : <div class="tpl-noimg" />}
                <span class="meta">
                  <small>{t.name}</small>
                  <span
                    class="del"
                    role="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      props.onDelete(t.id);
                    }}
                  >
                    &times;
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}

        <div class="linkrow">
          <button onClick={props.onExport}>Export .json</button>
          <button onClick={() => jsonInput.current?.click()}>Import .json</button>
        </div>

        <input
          ref={photoInput}
          type="file"
          accept="image/*"
          hidden
          onChange={() => pickFile(photoInput.current, props.onImportPhoto)}
        />
        <input
          ref={jsonInput}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={() => pickFile(jsonInput.current, props.onImportJson)}
        />
      </div>
    </div>
  );
}
