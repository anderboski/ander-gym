/**
 * The profile avatar's face — SPEC §5.1 / §5.7. The photo when one is set,
 * else up to two initials, else a person icon. Renders only the contents so
 * the caller picks the element: Home wraps it in a button, Profile in a span.
 */
import { useObjectUrl } from '../hooks/useObjectUrl';
import { UserIcon } from './icons';

/** Up to two initials from a name — "Ander Sainz" → "AS". */
function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}

export function AvatarFace({ name, photoBlob }: { name: string; photoBlob: Blob | null }) {
  const url = useObjectUrl(photoBlob);
  // `url` is null for one render after a photo is set (the hook creates it in
  // an effect); falling through to initials for that frame beats an empty disc.
  if (url) return <img src={url} alt="" />;
  const trimmed = name.trim();
  return trimmed ? <>{initials(trimmed)}</> : <UserIcon />;
}
