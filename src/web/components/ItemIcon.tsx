import { useState } from 'react';

interface Props {
  itemId: string;
  alt: string;
  size?: number;
}

/** Ícono real del juego (public/icons/<itemId>.png, copiado con scripts/extract/copy-icons.ts). Si falta, muestra un placeholder neutro en vez de un ícono roto. */
export default function ItemIcon({ itemId, alt, size = 32 }: Props) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div
        className="item-icon item-icon--placeholder"
        style={{ width: size, height: size }}
        title={alt}
        aria-hidden="true"
      />
    );
  }

  return (
    <img
      className="item-icon"
      src={`${import.meta.env.BASE_URL}icons/${itemId}.png`}
      alt={alt}
      width={size}
      height={size}
      onError={() => setFailed(true)}
    />
  );
}
