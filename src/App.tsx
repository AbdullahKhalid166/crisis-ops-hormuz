import React, { useState, useEffect } from 'react';
import { useTacticalWebSocket } from './hooks/useTacticalWebSocket.ts';
import { useSoundAlarm } from './hooks/useSoundAlarm.ts';
import { TopBar } from './components/TopBar.tsx';
import { LeftRail } from './components/LeftRail.tsx';
import { TacticalMap } from './components/TacticalMap.tsx';
import { RightPanel } from './components/RightPanel.tsx';
import { PlaybackScrubber } from './components/PlaybackScrubber.tsx';
import { PlaybackSnapshot } from './types.ts';
import { Alert, AlertDescription } from './components/ui/alert.tsx';
import { Badge } from './components/ui/badge.tsx';
import { Button } from './components/ui/button.tsx';
import { X, List, Info } from 'lucide-react';

export function App() {
  const {
    connected,
    latencyMs,
    role,
    captainShipId,
    fleet,
    ports,
    zones,
    weatherGrid,
    navigableWater,
    alerts,
    directives,
    playbackData,
    serverTime,
    lastServerAlert,
    switchRole,
    sendDirective,
    respondCaptain,
    createZone,
    deleteZone,
    acknowledgeAlert,
    resolveAlert,
    requestPlayback,
  } = useTacticalWebSocket();

  // Selected ship state
  const [selectedShipId, setSelectedShipId] = useState<string | null>(null);

  // Active right panel tab
  const [activeTab, setActiveTab] = useState<'details' | 'alerts' | 'directives' | 'zones'>('details');

  // Left Rail Collapsed State (Default collapsed on < 1400px screens)
  const [isRailCollapsed, setIsRailCollapsed] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth < 1400;
    }
    return false;
  });

  // Dismissed stack alerts from map view
  const [dismissedStackAlertIds, setDismissedStackAlertIds] = useState<Set<string>>(new Set());

  // Fleet Operational Status popover open state
  const [isFleetStatusOpen, setIsFleetStatusOpen] = useState<boolean>(false);

  // Playback state
  const [isLive, setIsLive] = useState<boolean>(true);
  const [playbackSnapshot, setPlaybackSnapshot] = useState<PlaybackSnapshot | null>(null);

  // Responsive breakpoints:
  // Mobile (<768px): Bottom sheets with drag handle, icon-only top row
  // Tablet (768px - 1199px): Collapsible slide-over fleet panel
  // Desktop (>=1200px): Persistent desktop layout
  const [windowWidth, setWindowWidth] = useState<number>(() =>
    typeof window !== 'undefined' ? window.innerWidth : 1440
  );
  const [mobileSheet, setMobileSheet] = useState<'none' | 'fleet' | 'context'>('none');
  const [tabletSlideOverOpen, setTabletSlideOverOpen] = useState<boolean>(false);

  useEffect(() => {
    const handleResize = () => {
      const w = window.innerWidth;
      setWindowWidth(w);
      if (w < 1400) {
        setIsRailCollapsed(true);
      }
      if (w >= 768 && mobileSheet !== 'none') {
        setMobileSheet('none');
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [mobileSheet]);

  const isMobile = windowWidth < 768;
  const isTablet = windowWidth >= 768 && windowWidth < 1200;
  const isDesktop = windowWidth >= 1200;

  // Sound alarms hook
  const { muted, toggleMute } = useSoundAlarm(alerts);

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

  // Dynamic CSS variables for offsets
  const currentRailWidth = isMobile
    ? '0px'
    : isTablet
    ? isRailCollapsed
      ? 'var(--left-rail-collapsed-width, 56px)'
      : '0px'
    : isRailCollapsed
    ? 'var(--left-rail-collapsed-width, 56px)'
    : 'var(--left-rail-width, 310px)';

  const isVesselCardOpen = !isMobile && selectedShipId !== null;
  const rightReservedWidth = isVesselCardOpen
    ? 'calc(var(--vessel-card-width, 340px) + 12px)'
    : '0px';

  return (
    <div
      style={
        {
          '--current-rail-width': currentRailWidth,
          '--right-reserved-width': rightReservedWidth,
        } as React.CSSProperties
      }
      className="flex flex-col w-screen h-screen overflow-hidden bg-[#1a1a1a] text-[#1f1f1f] antialiased select-none"
    >
      {/* Redesigned Top Bar (56px) */}
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
        onToggleLeftRail={() => {
          if (isTablet) {
            setTabletSlideOverOpen((prev) => !prev);
          } else {
            setIsRailCollapsed((prev) => !prev);
          }
        }}
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
        onFleetStatusOpenChange={setIsFleetStatusOpen}
        onOpenMobileFleet={() => setMobileSheet('fleet')}
      />

      {/* Main Viewport Container */}
      <div className="relative flex-1 flex w-full h-[calc(100vh-56px)] overflow-hidden bg-[#1a1a1a]">
        {/* Full-bleed Map Viewport */}
        <div className="absolute inset-0 w-full h-full z-0 overflow-hidden">
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
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[30] px-3.5 py-1 bg-[#c65d33] text-white font-bold rounded-full text-xs uppercase tracking-wider flex items-center space-x-2 shadow-lg ring-2 ring-[#c65d33]/50">
            <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
            <span>Historical Replay Active</span>
          </div>
        )}

        {/* Server Alert Notice banner */}
        {lastServerAlert && (
          <div className="absolute top-12 left-1/2 -translate-x-1/2 z-[32] px-4 py-2 bg-[#dc2626] text-white rounded-md font-semibold text-xs uppercase tracking-wider flex items-center space-x-2 shadow-xl">
            <span className="w-2 h-2 bg-white rounded-full" />
            <span>Authorization Notice: {lastServerAlert}</span>
          </div>
        )}

        {/* FIX 1: REPOSITIONED ALERT TOAST STACK */}
        {/* Fixed stack at TOP-CENTER of the map, starting 12px below the top bar (top: 12px), max-width 360px */}
        {/* z-index [40]: above map (z-0/z-30) but BELOW open popovers & dropdowns (z-50) */}
        {/* Map style switcher at top-right is completely visible, unobstructed, and clickable at all times */}
        {topActiveAlerts.length > 0 && !isFleetStatusOpen && (
          <div
            style={{
              top: '12px',
              maxWidth: '360px',
            }}
            className="absolute left-1/2 -translate-x-1/2 z-[40] w-[calc(100%-32px)] space-y-2 pointer-events-auto transition-all duration-150"
          >
            {topActiveAlerts.map((alert) => {
              const isCritical = alert.priority === 'CRITICAL';
              return (
                <Alert
                  key={alert.id}
                  variant={isCritical ? 'critical' : 'warning'}
                  className="bg-[#faf8f5]/95 backdrop-blur-xs p-3 transition-all text-xs"
                >
                  <div className="flex items-center justify-between">
                    <Badge
                      variant={isCritical ? 'distressed' : 'warning'}
                      className="text-[10px] font-mono font-bold"
                    >
                      {alert.priority}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={() =>
                        setDismissedStackAlertIds((prev) => new Set([...prev, alert.id]))
                      }
                      className="text-[#6b6660] hover:text-[#1f1f1f] h-5 w-5"
                      title="Dismiss alert preview"
                    >
                      <X size={12} />
                    </Button>
                  </div>

                  <AlertDescription className="text-xs text-[#1f1f1f] font-medium my-1 leading-snug truncate">
                    {alert.message}
                  </AlertDescription>

                  <div className="flex items-center justify-between pt-1 border-t border-[#ded9d2] mt-1">
                    <span className="text-[10px] text-[#6b6660] font-mono">
                      Ship: {alert.shipIds?.join(', ') || 'General'}
                    </span>
                    <div className="flex space-x-1.5">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => acknowledgeAlert(alert.id)}
                        className="h-7 px-2.5 text-xs font-medium"
                      >
                        Ack
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => resolveAlert(alert.id)}
                        className="h-7 px-2.5 text-xs font-medium"
                      >
                        Resolve
                      </Button>
                    </div>
                  </div>
                </Alert>
              );
            })}
          </div>
        )}

        {/* DESKTOP & TABLET PANELS (>= 768px) */}
        {!isMobile && (
          <>
            {/* Desktop Left Rail (Persistent or Icon-Rail) */}
            {isDesktop && (
              <div className="relative z-20 flex h-full pointer-events-auto">
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
            )}

            {/* Tablet Left Rail: Collapsible Slide-Over Drawer (<1200px) */}
            {isTablet && (
              <>
                {/* Slim Icon Rail anchor or toggle */}
                <div className="relative z-20 flex h-full pointer-events-auto">
                  <LeftRail
                    fleet={fleet}
                    selectedShipId={selectedShipId}
                    onSelectShip={(id) => {
                      setSelectedShipId(id);
                      setActiveTab('details');
                    }}
                    role={role}
                    captainShipId={captainShipId}
                    isCollapsed={!tabletSlideOverOpen}
                    onToggleCollapse={() => setTabletSlideOverOpen((prev) => !prev)}
                    isSlideOver={tabletSlideOverOpen}
                    onCloseSlideOver={() => setTabletSlideOverOpen(false)}
                  />
                </div>
              </>
            )}

            {/* Right Panel: Vessel Card opens with generous padding & layered shadow */}
            {selectedShipId && (
              <div
                style={{
                  top: '12px',
                  right: '12px',
                  width: 'var(--vessel-card-width, 340px)',
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

        {/* MOBILE RESPONSIVE PANELS (< 768px, verified at 375px): Full-Width Bottom Sheets with Drag Handle */}
        {isMobile && (
          <>
            {/* Mobile Sheet Quick Switcher (Floating bottom-right above scrubber) */}
            <div className="absolute bottom-20 right-3 z-30 flex items-center space-x-1.5 bg-[#faf8f5]/95 backdrop-blur-md rounded-lg shadow-lg border border-[#ded9d2] p-1">
              <Button
                variant={mobileSheet === 'fleet' ? 'primary' : 'ghost'}
                size="sm"
                onClick={() =>
                  setMobileSheet((prev) => (prev === 'fleet' ? 'none' : 'fleet'))
                }
                className="h-8 px-2.5 text-xs font-semibold space-x-1"
              >
                <List size={14} />
                <span>Fleet</span>
              </Button>

              <Button
                variant={mobileSheet === 'context' ? 'primary' : 'ghost'}
                size="sm"
                onClick={() =>
                  setMobileSheet((prev) => (prev === 'context' ? 'none' : 'context'))
                }
                className="h-8 px-2.5 text-xs font-semibold space-x-1"
              >
                <Info size={14} />
                <span>Vessel Card</span>
                {topActiveAlerts.length > 0 && (
                  <Badge variant="distressed" className="text-[9px] ml-1 px-1 py-0 h-3.5 font-mono">
                    {topActiveAlerts.length}
                  </Badge>
                )}
              </Button>
            </div>

            {/* Mobile Full-Width Bottom Sheet: Fleet (with visible drag handle) */}
            {mobileSheet === 'fleet' && (
              <div className="absolute inset-x-0 bottom-0 max-h-[75vh] h-[75vh] w-full z-40 bg-[#faf8f5] border-t border-[#ded9d2] rounded-t-2xl shadow-2xl flex flex-col overflow-hidden">
                {/* Drag Handle */}
                <div
                  onClick={() => setMobileSheet('none')}
                  className="w-full pt-2 pb-1 flex justify-center cursor-pointer hover:opacity-80 shrink-0"
                >
                  <div className="w-10 h-1 bg-[#ded9d2] rounded-full" />
                </div>
                <div className="flex-1 overflow-hidden">
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
                    isCollapsed={false}
                  />
                </div>
              </div>
            )}

            {/* Mobile Full-Width Bottom Sheet: Vessel Card (with visible drag handle) */}
            {mobileSheet === 'context' && (
              <div className="absolute inset-x-0 bottom-0 max-h-[75vh] h-[75vh] w-full z-40 bg-[#faf8f5] border-t border-[#ded9d2] rounded-t-2xl shadow-2xl flex flex-col overflow-hidden">
                {/* Drag Handle */}
                <div
                  onClick={() => setMobileSheet('none')}
                  className="w-full pt-2 pb-1 flex justify-center cursor-pointer hover:opacity-80 shrink-0"
                >
                  <div className="w-10 h-1 bg-[#ded9d2] rounded-full" />
                </div>
                <div className="flex-1 overflow-hidden">
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

export default App;
