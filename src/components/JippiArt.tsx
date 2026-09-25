import type { CSSProperties } from 'react';

export type JippiPose = 'wave' | 'document' | 'celebrate' | 'job';

interface JippiArtProps {
  pose?: JippiPose;
  className?: string;
  alt?: string;
  priority?: boolean;
}

const style: CSSProperties = {
  display: 'block', width: '100%', height: '100%', objectFit: 'contain',
  userSelect: 'none', pointerEvents: 'none',
};

/** Jippi brand artwork, served with the app without external image requests. */
export default function JippiArt({ pose = 'wave', className = '', alt = '', priority = false }: JippiArtProps) {
  return <img
    className={`jippi-art ${className}`}
    src={`${import.meta.env.BASE_URL}brand/jippi-${pose === 'document' || pose === 'job' ? 'document' : 'wave'}.avif`}
    alt={alt}
    width={420}
    height={420}
    loading={priority ? 'eager' : 'lazy'}
    fetchPriority={priority ? 'high' : 'auto'}
    decoding="async"
    draggable={false}
    style={style}
  />;
}
