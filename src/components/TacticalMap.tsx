import React, { useState, useEffect } from 'react';
import { TacticalMapProps, LeafletTacticalMap } from './LeafletTacticalMap.tsx';
import { MapboxTacticalMap } from './MapboxTacticalMap.tsx';

interface TokenDiagnostics {
  procToken: string | undefined;
  metaViteToken: string | undefined;
  metaToken: string | undefined;
  resolvedToken: string | null;
  reason: string;
}

function getDiagnostics(): TokenDiagnostics {
  const procToken = typeof process !== 'undefined' ? process.env?.MAPBOX_TOKEN : undefined;
  const metaViteToken = typeof import.meta !== 'undefined' ? (import.meta as any).env?.VITE_MAPBOX_TOKEN : undefined;
  const metaToken = typeof import.meta !== 'undefined' ? (import.meta as any).env?.MAPBOX_TOKEN : undefined;

  const rawCandidate = (procToken || metaViteToken || metaToken || '').trim();

  let resolvedToken: string | null = null;
  let reason = '';

  if (!rawCandidate) {
    reason = 'Neither process.env.MAPBOX_TOKEN nor import.meta.env.VITE_MAPBOX_TOKEN is defined';
  } else if (
    rawCandidate === 'PASTE_YOUR_MAPBOX_TOKEN_HERE' ||
    rawCandidate.includes('PASTE_YOUR_MAPBOX_TOKEN')
  ) {
    reason = 'Token contains default placeholder "PASTE_YOUR_MAPBOX_TOKEN_HERE"';
  } else if (rawCandidate.length < 15) {
    reason = 'Token is shorter than valid Mapbox public token length (<15 chars)';
  } else {
    resolvedToken = rawCandidate;
    reason = 'Valid token provided';
  }

  return {
    procToken,
    metaViteToken,
    metaToken,
    resolvedToken,
    reason,
  };
}

export const TacticalMap: React.FC<TacticalMapProps> = (props) => {
  const [token, setToken] = useState<string | null>(() => getDiagnostics().resolvedToken);
  const [fallbackToLeaflet, setFallbackToLeaflet] = useState<boolean>(() => !getDiagnostics().resolvedToken);

  useEffect(() => {
    const diag = getDiagnostics();
    setToken(diag.resolvedToken);

    // Detailed console diagnosis
    console.info(
      `[TacticalMap Diagnostic] process.env.MAPBOX_TOKEN: ${diag.procToken ? (diag.procToken.includes('PASTE') ? 'PLACEHOLDER' : 'DEFINED') : 'UNDEFINED'}, import.meta.env.VITE_MAPBOX_TOKEN: ${diag.metaViteToken ? (diag.metaViteToken.includes('PASTE') ? 'PLACEHOLDER' : 'DEFINED') : 'UNDEFINED'}. Status: ${diag.reason}`
    );

    if (!diag.resolvedToken) {
      console.warn(
        `[TacticalMap Fallback] Mapbox GL requires a valid MAPBOX_TOKEN or VITE_MAPBOX_TOKEN (${diag.reason}). Seamlessly rendering Leaflet Ocean/Satellite tactical map.`
      );
      setFallbackToLeaflet(true);
    } else {
      setFallbackToLeaflet(false);
    }
  }, []);

  const handleAuthError = () => {
    console.warn(
      '[TacticalMap Fallback] Mapbox authentication failed with provided token. Falling back to Leaflet Ocean/Satellite map.'
    );
    setFallbackToLeaflet(true);
  };

  if (!token || fallbackToLeaflet) {
    return <LeafletTacticalMap {...props} />;
  }

  return (
    <MapboxTacticalMap
      {...props}
      mapboxToken={token}
      onAuthError={handleAuthError}
    />
  );
};
