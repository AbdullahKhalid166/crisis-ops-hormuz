import React, { useState, useEffect } from 'react';
import { useTacticalWebSocket } from './hooks/useTacticalWebSocket.ts';
import { useSoundAlarm } from './hooks/useSoundAlarm.ts';
import { TopBar } from './components/TopBar.tsx';
import { LeftRail } from './components/LeftRail.tsx';
import { TacticalMap } from './components/TacticalMap.tsx';
import { RightPanel } from './components/RightPanel.tsx';
import { PlaybackScrubber } from './components/PlaybackScrubber.tsx';
import { PlaybackSnapshot } from './types.ts';
import { List, Info, X } from 'lucide-react';

export default function App() {
  const {
    connected,
    latencyMs,
    lastServerAlert,
    role,
    captainShipId,
    fleet,
    ports,
    zones,
    alerts,
    directives,
    weatherGrid,
    navigableWater,
    playbackData,
    activeAlertCount,
    serverTime,
    switchRole,
    createZone,
    deleteZone,
    sendDirective,
    respondCaptain,
    acknowledgeAlert,
    resolveAlert,
    requestPlayback,
  } = useTacticalWebSocket();

  const { muted, toggleMute } = useSoundAlarm(alerts);

  const [selectedShipId, setSelectedShipId] = useState<string | null>('MV-1');
  const [activeTab, setActiveTab] = useState<'details' | 'alerts' | 'directives' | 'zones'>('details');

  // Left Rail collapse state: collapsed by default on screens < 1400px
  const [isRailCollapsed, setIsRailCollapsed] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth < 1400;
    }
    return false;
  });

  // Dismissed stack alerts from map view
  const [dismissedStackAlertIds, setDismissedStackAlertIds] = useState<Set<string>>(new Set());

  // Playback state
  const [isLive, setIsLive] = useState<boolean>(true);
  const [playbackSnapshot, setPlaybackSnapshot] = useState<PlaybackSnapshot | null>(null);

  // Responsive state (<900px bottom sheets)
  const [isMobile, setIsMobile] = useState<boolean>(false);
  const [mobileSheet, setMobileSheet] = useState<'none' | 'fleet' | 'context'>('none');

  useEffect(() => {
    const checkWidth = () => {
      const mobile = window.innerWidth < 900;
      setIsMobile(mobile);
      if (window.innerWidth < 1400) {
        setIsRailCollapsed(true);
      }
    };
    checkWidth();
    window.addEventListener('resize', checkWidth);
    return () => window.removeEventListener('resize', checkWidth);
  }, []);

  // If role switches to captain, lock selected ship to captain's ship
  useEffect(() => {
    if (role === 'captain') {
      setSelectedShipId(captainShipId);
    }
  }, [role, captainShipId]);

  // Selected ship object
  const selectedShip = fleet.find((s) => s.shipId === selectedShipId) || null;

  // Active critical & high alerts for the compact stack on the map
  const topActiveAlerts = alerts
    .filter((a) => a.state === 'active' && !dismissedStackAlertIds.has(a.id))
    .slice(0, 3);

  // CSS variables calculated for dynamic offsets across widths 1024, 1280, 1440, 1920
  const currentRailWidth = isMobile
    ? '0px'
    : isRailCollapsed
    ? 'var(--left-rail-collapsed-width, 56px)'
    : 'var(--left-rail-width, 300px)';

  const isVesselCardOpen = !isMobile && selectedShipId !== null;
  const rightReservedWidth = isVesselCardOpen
    ? 'calc(var(--vessel-card-width, 320px) + 12px)'
    : '0px';

  return (
    <div
      style={
        {
          '--current-rail-width': currentRailWidth,
          '--right-reserved-width': rightReservedWidth,
        } as React.CSSProperties
      }
      className="flex flex-col w-screen h-screen overflow-hidden bg-[#f4f6f8] text-[#111827] antialiased select-none"
    >
      {/* Slim Navy Top Bar (50px) */}
      <TopBar
        role={role}
        captainShipId={captainShipId}
        fleet={fleet}
        ports={ports}
        onSwitchRole={switchRole}
        connected={connected}
        latencyMs={latencyMs}
        alerts={alerts}
        muted={muted}
        onToggleMute={toggleMute}
        onToggleLeftRail={() => setIsRailCollapsed((prev) => !prev)}
        onSelectShip={(id) => {
          setSelectedShipId(id);
          setActiveTab('details');
          if (isMobile) setMobileSheet('context');
        }}
        onAcknowledgeAlert={acknowledgeAlert}
        onResolveAlert={resolveAlert}
        onOpenAlertsTab={() => {
          setActiveTab('alerts');
          if (isMobile) setMobileSheet('context');
        }}
      />

      {/* Main Map-First Workspace */}
      <div className="flex-1 relative overflow-hidden flex">
        {/* Full-Screen Map (Underneath) */}
        <div className="absolute inset-0 z-0">
          <TacticalMap
            fleet={fleet}
            ports={ports}
            zones={zones}
            weatherGrid={weatherGrid}
            navigableWater={navigableWater}
            selectedShipId={selectedShipId}
            onSelectShip={(id) => {
              setSelectedShipId(id);
              setActiveTab('details');
              if (isMobile) setMobileSheet('context');
            }}
            serverTime={serverTime}
            role={role}
            onCreateZone={createZone}
            onDeleteZone={deleteZone}
            historicalPositions={
              !isLive && playbackSnapshot ? playbackSnapshot.ships : undefined
            }
          />
        </div>

        {/* Historical Replay Active Tag */}
        {!isLive && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1100] px-3.5 py-1 bg-amber-500 text-slate-950 font-bold rounded-full text-xs uppercase tracking-wider flex items-center space-x-2 shadow-lg ring-2 ring-amber-300">
            <span className="w-2 h-2 rounded-full bg-slate-950 animate-pulse" />
            <span>Historical Replay Active</span>
          </div>
        )}

        {/* Server Alert Warning banner */}
        {lastServerAlert && (
          <div className="absolute top-[72px] left-1/2 -translate-x-1/2 z-[1300] px-4 py-2 bg-red-600 text-white rounded-md font-semibold text-xs uppercase tracking-wider flex items-center space-x-2 shadow-xl">
            <span className="w-2 h-2 bg-white rounded-full" />
            <span>Authorization Notice: {lastServerAlert}</span>
          </div>
        )}

        {/* Compact Alert Stack at Top-Right of Map (Shifts left when vessel card is open so it NEVER overlaps) */}
        {topActiveAlerts.length > 0 && !isMobile && (
          <div
            style={{
              right: isVesselCardOpen
                ? 'calc(var(--vessel-card-width, 320px) + 24px)'
                : '16px',
              top: lastServerAlert ? '112px' : '52px',
            }}
            className="absolute z-[1000] w-72 space-y-2 pointer-events-auto transition-all duration-150"
          >
            {topActiveAlerts.map((alert) => {
              const isCritical = alert.priority === 'CRITICAL';
              return (
                <div
                  key={alert.id}
                  className={`bg-white rounded-lg shadow-lg border p-2.5 transition-editorial text-xs ${
                    isCritical
                      ? 'border-l-4 border-l-red-600 border-red-200 bg-red-50/30'
                      : 'border-l-4 border-l-amber-500 border-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.2 rounded font-mono ${
                        isCritical ? 'bg-red-600 text-white' : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {alert.priority}
                    </span>
                    <button
                      onClick={() =>
                        setDismissedStackAlertIds((prev) => new Set([...prev, alert.id]))
                      }
                      className="text-slate-400 hover:text-slate-700 p-0.5"
                      title="Dismiss alert preview"
                    >
                      <X size={12} />
                    </button>
                  </div>

                  <p className="text-xs text-slate-800 font-medium my-1 leading-snug truncate">
                    {alert.message}
                  </p>

                  <div className="flex items-center justify-between pt-1 border-t border-slate-100 mt-1">
                    <span className="text-[10px] text-slate-500 font-mono">
                      Ship: {alert.shipIds?.join(', ') || 'General'}
                    </span>
                    <div className="flex space-x-1">
                      <button
                        onClick={() => acknowledgeAlert(alert.id)}
                        className="px-2 py-0.5 text-[10px] font-medium rounded border border-slate-300 hover:bg-slate-100 text-slate-700 transition-editorial cursor-pointer"
                      >
                        Ack
                      </button>
                      {role === 'command' && (
                        <button
                          onClick={() => resolveAlert(alert.id)}
                          className="px-2 py-0.5 text-[10px] font-medium rounded bg-slate-900 hover:bg-slate-800 text-white transition-editorial cursor-pointer"
                        >
                          Resolve
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* DESKTOP PANELS (>= 900px) */}
        {!isMobile && (
          <>
            {/* Left Rail: Collapsible Fleet List (300px or slim icon rail 56px) */}
            <div className="relative z-20 h-full flex pointer-events-auto">
              <LeftRail
                fleet={fleet}
                selectedShipId={selectedShipId}
                onSelectShip={(id) => {
                  setSelectedShipId(id);
                  setActiveTab('details');
                }}
                role={role}
                captainShipId={captainShipId}
                isCollapsed={isRailCollapsed}
                onToggleCollapse={() => setIsRailCollapsed((prev) => !prev)}
              />
            </div>

            {/* Right Panel: Ship Card opens only when a ship is selected (320px) */}
            {/* NOTE: Positioned strictly ABOVE the zoom buttons & attribution with 110px bottom reserve */}
            {selectedShipId && (
              <div
                style={{
                  top: '12px',
                  right: '12px',
                  width: 'var(--vessel-card-width, 320px)',
                  maxHeight: 'calc(100vh - 56px - 12px - 110px)',
                }}
                className="absolute z-20 flex flex-col pointer-events-auto transition-all duration-150"
              >
                <RightPanel
                  selectedShip={selectedShip}
                  fleet={fleet}
                  ports={ports}
                  zones={zones}
                  alerts={alerts}
                  directives={directives}
                  role={role}
                  captainShipId={captainShipId}
                  activeTab={activeTab}
                  setActiveTab={setActiveTab}
                  onSendDirective={sendDirective}
                  onCaptainRespond={respondCaptain}
                  onAcknowledgeAlert={acknowledgeAlert}
                  onResolveAlert={resolveAlert}
                  onDeleteZone={deleteZone}
                  onSelectShip={(id) => {
                    setSelectedShipId(id);
                    setActiveTab('details');
                  }}
                  onClose={() => setSelectedShipId(null)}
                />
              </div>
            )}
          </>
        )}

        {/* MOBILE RESPONSIVE PANELS (< 900px): Bottom Sheets */}
        {isMobile && (
          <>
            {/* Floating Mobile Toggle Bar */}
            <div className="absolute top-3 right-3 z-30 flex items-center space-x-2 bg-white rounded-lg shadow-md border border-[#e3e7ec] p-1">
              <button
                onClick={() =>
                  setMobileSheet((prev) => (prev === 'fleet' ? 'none' : 'fleet'))
                }
                className={`px-3 py-1 rounded text-xs font-semibold transition-editorial cursor-pointer flex items-center space-x-1 ${
                  mobileSheet === 'fleet'
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <List size={13} />
                <span>Fleet</span>
              </button>

              <button
                onClick={() =>
                  setMobileSheet((prev) => (prev === 'context' ? 'none' : 'context'))
                }
                className={`px-3 py-1 rounded text-xs font-semibold transition-editorial cursor-pointer flex items-center space-x-1 ${
                  mobileSheet === 'context'
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Info size={13} />
                <span>Vessel Card</span>
                {activeAlertCount > 0 && (
                  <span className="text-[10px] font-bold text-red-600 font-mono">({activeAlertCount})</span>
                )}
              </button>
            </div>

            {/* Mobile Bottom Sheet: Fleet */}
            {mobileSheet === 'fleet' && (
              <div className="absolute inset-x-0 bottom-0 max-h-[70vh] h-[70vh] z-40 bg-white border-t border-[#e3e7ec] rounded-t-xl shadow-2xl flex flex-col">
                <LeftRail
                  fleet={fleet}
                  selectedShipId={selectedShipId}
                  onSelectShip={(id) => {
                    setSelectedShipId(id);
                    setActiveTab('details');
                    setMobileSheet('context');
                  }}
                  role={role}
                  captainShipId={captainShipId}
                />
              </div>
            )}

            {/* Mobile Bottom Sheet: Context / Vessel Card */}
            {mobileSheet === 'context' && (
              <div className="absolute inset-x-0 bottom-0 max-h-[70vh] h-[70vh] z-40 bg-white border-t border-[#e3e7ec] rounded-t-xl shadow-2xl flex flex-col">
                <RightPanel
                  selectedShip={selectedShip}
                  fleet={fleet}
                  ports={ports}
                  zones={zones}
                  alerts={alerts}
                  directives={directives}
                  role={role}
                  captainShipId={captainShipId}
                  activeTab={activeTab}
                  setActiveTab={setActiveTab}
                  onSendDirective={sendDirective}
                  onCaptainRespond={respondCaptain}
                  onAcknowledgeAlert={acknowledgeAlert}
                  onResolveAlert={resolveAlert}
                  onDeleteZone={deleteZone}
                  onSelectShip={setSelectedShipId}
                  onClose={() => setMobileSheet('none')}
                />
              </div>
            )}
          </>
        )}

        {/* Floating Pill-Shaped Playback Timeline Scrubber */}
        <PlaybackScrubber
          playbackData={playbackData}
          serverTime={serverTime}
          onRequestPlayback={requestPlayback}
          isLive={isLive}
          setIsLive={setIsLive}
          playbackSnapshot={playbackSnapshot}
          setPlaybackSnapshot={setPlaybackSnapshot}
        />
      </div>
    </div>
  );
}
