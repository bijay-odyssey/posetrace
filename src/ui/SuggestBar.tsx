import { SCENE_CATEGORIES, type BankPose, type SceneCategory } from '../data/poseBank';

type Props = {
  category: SceneCategory | null;
  onCategory: (c: SceneCategory | null) => void;
  autoScene: boolean;
  onToggleAuto: () => void;
  detected: SceneCategory | null;
  suggestions: BankPose[];
  thumbs: Record<string, string>;
  activeId: string | null;
  onPick: (p: BankPose) => void;
};

export function SuggestBar(props: Props) {
  return (
    <div class="suggest">
      <div class="chips">
        <button
          class={`chip${props.autoScene ? ' on' : ''}`}
          onClick={props.onToggleAuto}
          title="Detect scene from camera"
        >
          {props.autoScene ? (props.detected ? `Auto: ${props.detected}` : 'Auto…') : 'Auto'}
        </button>
        {SCENE_CATEGORIES.map((c) => (
          <button
            key={c.id}
            class={`chip${props.category === c.id ? ' on' : ''}`}
            onClick={() => props.onCategory(props.category === c.id ? null : c.id)}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div class="strip">
        {props.suggestions.map((pose) => (
          <button
            key={pose.id}
            class={`pose${props.activeId === `bank:${pose.id}` ? ' active' : ''}`}
            onClick={() => props.onPick(pose)}
          >
            <img src={props.thumbs[pose.id]} alt={pose.name} />
            <small>{pose.name}</small>
          </button>
        ))}
      </div>
    </div>
  );
}
