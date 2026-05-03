const PALETTE = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444',
  '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16',
];

function hashColor(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

function initials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function Avatar({ name = '', avatar, size = 28, showName = false, title }) {
  const px = size;
  const tooltip = title ?? name;
  const style = { width: px, height: px, fontSize: Math.round(px * 0.42) };

  const visual = avatar
    ? <img src={avatar} alt={name} className="avatar-img" style={style} title={tooltip} />
    : (
      <span
        className="avatar-initials"
        style={{ ...style, background: hashColor(name) }}
        title={tooltip}
      >
        {initials(name)}
      </span>
    );

  if (!showName) return visual;
  return (
    <span className="avatar-with-name">
      {visual}
      <span className="avatar-name">{name}</span>
    </span>
  );
}
