import React, { useState, useRef, useEffect } from 'react';
import {
  Ship,
  Port,
  RestrictedZone,
  Alert,
  Directive,
  Role,
  DirectiveType,
} from '../types.ts';
import {
  X,
  Trash2,
  Navigation,
  Gauge,
  Fuel,
  Clock,
  Compass,
  AlertTriangle,
  Send,
  CheckCircle2,
} from 'lucide-react';
import { getCargoInfo } from '../utils/cargoTheme.ts';

interface RightPanelProps {
  selectedShip: Ship | null;
  fleet: Ship[];
  ports: Port[];
  zones: RestrictedZone[];
  alerts: Alert[];
  directives: Directive[];
  role: Role;
  captainShipId: string;
  activeTab: 'details' | 'alerts' | 'directives' | 'zones';
  setActiveTab: (tab: 'details' | 'alerts' | 'directives' | 'zones') => void;
  onSendDirective: (directive: Omit<Directive, 'id' | 'issuedAt' | 'status'>) => void;
  onCaptainRespond: (action: 'ACCEPT' | 'ESCALATE_DISTRESS', directiveId?: string, distressText?: string) => void;
  onAcknowledgeAlert: (alertId: string) => void;
  onResolveAlert: (alertId: string) => void;
  onDeleteZone: (zoneId: string) => void;
  onSelectShip: (shipId: string) => void;
  onClose?: () => void;
}

export const RightPanel: React.FC<RightPanelProps> = ({
  selectedShip,
  fleet,
  ports,
  zones,
  alerts,
  directives,
  role,
  captainShipId,
  activeTab,
  setActiveTab,
  onSendDirective,
  onCaptainRespond,
  onAcknowledgeAlert,
  onResolveAlert,
  onDeleteZone,
  onSelectShip,
  onClose,
}) => {
  // Command Directive Form State
  const [directiveType, setDirectiveType] = useState<DirectiveType>('REROUTE_PORT');
  const [targetPort, setTargetPort] = useState<string>('MCT-1');
  const [waypointLat, setWaypointLat] = useState<string>('25.5');
  const [waypointLng, setWaypointLng] = useState<string>('57.0');
  const [directiveNote, setDirectiveNote] = useState<string>('');

  // Captain Distress Modal State
  const [distressText, setDistressText] = useState<string>('');
  const [showDistressModal, setShowDistressModal] = useState<boolean>(false);

  // Scroll container ref for resetting scroll on role or ship change
  const scrollRef = useRef<HTMLDivElement>(null);

  const captainShip = fleet.find((s) => s.shipId === captainShipId);
  const isCaptainMode = role === 'captain';
  const isAssignedCaptainShip = isCaptainMode && selectedShip && selectedShip.shipId === captainShipId;
  const isOtherShipInCaptainMode = isCaptainMode && selectedShip && selectedShip.shipId !== captainShipId;

  // Auto-switch to details tab when inspecting another ship in captain mode
  useEffect(() => {
    if (isOtherShipInCaptainMode && activeTab !== 'details') {
      setActiveTab('details');
    }
  }, [isOtherShipInCaptainMode, activeTab, setActiveTab]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [selectedShip?.shipId, role]);

  const formatEta = (seconds: number | null): string => {
    if (seconds === null || seconds <= 0) return 'Stationary';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return `${hrs}h ${mins}m`;
  };

  const handleSendDirective = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedShip) return;

    let wp: [number, number] | undefined = undefined;
    if (directiveType === 'DIVERT_WAYPOINT') {
      const lat = parseFloat(waypointLat);
      const lng = parseFloat(waypointLng);
      if (!isNaN(lat) && !isNaN(lng)) {
        wp = [lat, lng];
      }
    }

    onSendDirective({
      shipId: selectedShip.shipId,
      type: directiveType,
      targetPort: directiveType === 'REROUTE_PORT' ? targetPort : undefined,
      waypoint: wp,
      issuedBy: 'Fleet Command',
      note: directiveNote.trim() || undefined,
    });

    setDirectiveNote('');
  };

  const handleEscalateDistress = () => {
    if (!distressText.trim()) return;
    onCaptainRespond('ESCALATE_DISTRESS', undefined, distressText.trim());
    setDistressText('');
    setShowDistressModal(false);
  };

  const activeAlertsCount = alerts.filter((a) => a.state === 'active').length;
  const shipCargo = selectedShip ? getCargoInfo(selectedShip.cargo) : null;

  return (
    <aside
      style={{
        width: 'var(--vessel-card-width, 320px)',
        maxHeight: 'calc(100vh - 56px - 12px - 110px)',
      }}
      className="w-full max-w-full h-full max-h-full bg-white border border-[#e3e7ec] rounded-lg shadow-xl flex flex-col z-30 select-none overflow-hidden transition-editorial"
    >
      {/* Sticky Header with Title & Navigation Tabs */}
      <div className="sticky top-0 z-20 border-b border-[#e3e7ec] bg-[#f8fafc] px-3 pt-2 shrink-0 shadow-xs">
        <div className="flex items-center justify-between pb-1.5">
          <div className="flex items-center space-x-1.5 min-w-0">
            <span className="section-label text-slate-800 shrink-0">
              {isOtherShipInCaptainMode ? 'Read-Only Summary' : 'Vessel Card'}
            </span>
            {selectedShip && (
              <span className="text-[11px] font-mono text-slate-500 font-medium shrink-0">
                · {selectedShip.shipId}
              </span>
            )}
            {isOtherShipInCaptainMode && (
              <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 shrink-0">
                Traffic
              </span>
            )}
            {isAssignedCaptainShip && (
              <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 shrink-0">
                Assigned
              </span>
            )}
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition-editorial cursor-pointer shrink-0"
              title="Close vessel card"
            >
              <X size={15} />
            </button>
          )}
        </div>

        {/* Tab switcher: If inspecting another ship in captain mode, show simple read-only label and do NOT expose directives/alerts/zones */}
        {isOtherShipInCaptainMode ? (
          <div className="flex items-center space-x-1.5 text-xs font-semibold text-slate-600 border-t border-[#e3e7ec]/80 pt-1.5 pb-2">
            <span className="w-2 h-2 rounded-full bg-slate-400 shrink-0" />
            <span>Situational Traffic Summary (No Directives / Controls)</span>
          </div>
        ) : (
          <div className="flex space-x-2 text-xs font-medium border-t border-[#e3e7ec]/80 pt-1">
            {(isCaptainMode ? (['details', 'directives'] as const) : (['details', 'directives', 'alerts', 'zones'] as const)).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`pb-1.5 capitalize transition-editorial cursor-pointer border-b-2 flex items-center space-x-1 ${
                  activeTab === tab
                    ? 'border-amber-500 text-slate-900 font-semibold'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <span>{tab}</span>
                {tab === 'alerts' && activeAlertsCount > 0 && (
                  <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-red-100 text-red-600 font-mono">
                    {activeAlertsCount}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Scrollable Container with reset scroll on role or ship change */}
      <div
        ref={scrollRef}
        style={{ padding: '12px' }}
        className="flex-1 overflow-y-auto space-y-3 text-xs text-slate-800"
      >
        {/* TAB 1: DETAILS */}
        {activeTab === 'details' && (
          <>
            {!selectedShip ? (
              <div className="text-center py-12 text-slate-400 space-y-2">
                <Compass size={28} className="mx-auto text-slate-300" />
                <p className="font-medium text-xs">No vessel selected</p>
                <p className="text-[11px] text-slate-400 max-w-[220px] mx-auto">
                  Click any ship marker on the map or select from the fleet list.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {/* 1. IDENTITY SECTION: Name, ID, Cargo badge, Status badge */}
                <div className="space-y-1.5 bg-slate-50 p-2.5 rounded-lg border border-[#e3e7ec]">
                  <div className="flex items-start justify-between">
                    <div className="min-w-0 mr-2">
                      <div className="flex items-center space-x-1.5">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: shipCargo?.color }}
                        />
                        <h2 className="vessel-name text-slate-900 tracking-tight truncate text-[13px]">
                          {selectedShip.name}
                        </h2>
                      </div>
                      <div className="flex items-center space-x-1.5 mt-0.5">
                        <span className="text-[10px] text-slate-500 font-mono">
                          ID: {selectedShip.shipId}
                        </span>
                        <span
                          className="text-[9px] font-medium px-1.5 py-0.2 rounded"
                          style={{
                            backgroundColor: shipCargo?.bgLight,
                            color: shipCargo?.textColor,
                          }}
                        >
                          {shipCargo?.label}
                        </span>
                      </div>
                    </div>

                    {/* Status Badge */}
                    <span
                      className={`text-[9px] uppercase font-bold px-1.5 py-0.5 rounded shadow-xs shrink-0 ${
                        selectedShip.status === 'distressed'
                          ? 'bg-red-600 text-white animate-pulse'
                          : selectedShip.status === 'rerouting'
                          ? 'bg-amber-100 text-amber-800 border border-amber-300'
                          : ['insufficient_fuel', 'no_fuel', 'stranded'].includes(selectedShip.status)
                          ? 'bg-red-100 text-red-700'
                          : 'bg-emerald-100 text-emerald-800'
                      }`}
                    >
                      {selectedShip.status.replace('_', ' ')}
                    </span>
                  </div>

                  {selectedShip.inAdverseWeather && (
                    <div className="text-[10px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1 flex items-center space-x-1.5">
                      <AlertTriangle size={12} className="text-amber-600 shrink-0" />
                      <span>Adverse weather · Fuel burn ×1.3</span>
                    </div>
                  )}
                </div>

                {/* 2. THREE STAT TILES: Equal width, min-width, tabular numerals, ~64px high */}
                <div className="grid grid-cols-3 gap-1.5">
                  {/* Speed Tile */}
                  <div className="bg-slate-50 border border-[#e3e7ec] rounded-lg h-[64px] min-h-[64px] max-h-[64px] p-1.5 flex flex-col justify-between items-center text-center min-w-0 w-full">
                    <div className="section-label flex items-center justify-center space-x-1 text-[10px] text-slate-500 leading-none">
                      <Gauge size={11} className="shrink-0" />
                      <span className="truncate">Speed</span>
                    </div>
                    <div className="stat-value text-slate-900 tabular-nums text-sm font-bold leading-tight">
                      {selectedShip.speed.toFixed(1)}
                    </div>
                    <span className="text-[9px] text-slate-400 font-mono leading-none">knots</span>
                  </div>

                  {/* Fuel Tile */}
                  <div className="bg-slate-50 border border-[#e3e7ec] rounded-lg h-[64px] min-h-[64px] max-h-[64px] p-1.5 flex flex-col justify-between items-center text-center min-w-0 w-full">
                    <div className="section-label flex items-center justify-center space-x-1 text-[10px] text-slate-500 leading-none">
                      <Fuel size={11} className="shrink-0" />
                      <span className="truncate">Fuel</span>
                    </div>
                    <div
                      className={`stat-value tabular-nums text-sm font-bold leading-tight ${
                        selectedShip.fuel < 1000 ? 'text-red-600' : 'text-slate-900'
                      }`}
                    >
                      {Math.round(selectedShip.fuel)}
                    </div>
                    <span className="text-[9px] text-slate-400 font-mono leading-none">tons</span>
                  </div>

                  {/* ETA Tile: Never truncates; wraps or formats cleanly */}
                  <div className="bg-slate-50 border border-[#e3e7ec] rounded-lg h-[64px] min-h-[64px] max-h-[64px] p-1.5 flex flex-col justify-between items-center text-center min-w-0 w-full">
                    <div className="section-label flex items-center justify-center space-x-1 text-[10px] text-slate-500 leading-none">
                      <Clock size={11} className="shrink-0" />
                      <span className="truncate">ETA</span>
                    </div>
                    <div className="font-mono font-bold text-slate-900 tabular-nums text-xs leading-tight text-center truncate w-full">
                      {formatEta(selectedShip.etaSeconds)}
                    </div>
                    <span className="text-[9px] text-slate-400 truncate leading-none w-full block">
                      {selectedShip.destinationPortName || selectedShip.destination}
                    </span>
                  </div>
                </div>

                {/* 3. TELEMETRY & ROUTING */}
                <div className="border-t border-[#e3e7ec] pt-2">
                  <span className="section-label block mb-1 text-[11px] text-slate-600">
                    Telemetry & Routing
                  </span>

                  <div className="h-[30px] min-h-[30px] flex justify-between items-center text-xs border-b border-slate-100">
                    <span className="text-slate-500">True Heading</span>
                    <span className="font-mono font-medium text-slate-900">{selectedShip.heading}°</span>
                  </div>

                  <div className="h-[30px] min-h-[30px] flex justify-between items-center text-xs border-b border-slate-100">
                    <span className="text-slate-500">Destination</span>
                    <span className="font-medium text-slate-900 truncate ml-2 max-w-[170px] text-right">
                      {selectedShip.destinationPortName || selectedShip.destination}
                    </span>
                  </div>

                  <div className="h-[30px] min-h-[30px] flex justify-between items-center text-xs border-b border-slate-100">
                    <span className="text-slate-500">Coordinates</span>
                    <span className="font-mono text-slate-900 tabular-nums">
                      {selectedShip.position[0].toFixed(3)}°N, {selectedShip.position[1].toFixed(3)}°E
                    </span>
                  </div>

                  <div className="h-[30px] min-h-[30px] flex justify-between items-center text-xs border-b border-slate-100">
                    <span className="text-slate-500">Fuel Required</span>
                    <span className="font-mono text-slate-900 tabular-nums">
                      {selectedShip.fuelNeeded.toFixed(1)} tons
                    </span>
                  </div>

                  <div className="h-[30px] min-h-[30px] flex justify-between items-center text-xs border-b border-slate-100">
                    <span className="text-slate-500">Route Viability</span>
                    <span
                      className={`font-semibold text-[10px] px-1.5 py-0.2 rounded ${
                        selectedShip.canReachDestination
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-red-50 text-red-700 font-bold'
                      }`}
                    >
                      {selectedShip.canReachDestination ? 'Viable' : 'Fuel Deficit'}
                    </span>
                  </div>
                </div>

                {/* 4. DISTRESS REPORT (if distressed) */}
                {selectedShip.status === 'distressed' && selectedShip.distressInfo && (
                  <div className="border border-red-200 bg-red-50/50 rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between border-b border-red-200/80 pb-1">
                      <span className="section-label text-red-700 flex items-center space-x-1">
                        <AlertTriangle size={13} className="text-red-600" />
                        <span>Incident distress report</span>
                      </span>
                      <span className="text-[9px] font-mono text-red-500 bg-white px-1.5 py-0.2 rounded border border-red-200">
                        {selectedShip.distressInfo.source === 'ai' ? 'GEMINI 3.8 FLASH' : 'LOCAL NLP'}
                      </span>
                    </div>

                    <div className="font-semibold text-slate-900 text-xs">
                      {selectedShip.distressInfo.incidentType}
                    </div>

                    <p className="text-[11px] text-slate-700 italic bg-white/70 p-2 rounded border border-red-100 leading-relaxed">
                      "{selectedShip.distressInfo.summary}"
                    </p>

                    <div className="grid grid-cols-3 gap-2 text-center pt-1">
                      <div className="bg-white p-1.5 rounded border border-red-100">
                        <span className="section-label block text-[10px]">Injuries</span>
                        <span className="text-xs font-bold font-mono text-red-600 tabular-nums">
                          {selectedShip.distressInfo.injuries}
                        </span>
                      </div>
                      <div className="bg-white p-1.5 rounded border border-red-100">
                        <span className="section-label block text-[10px]">Fatalities</span>
                        <span className="text-xs font-bold font-mono text-red-600 tabular-nums">
                          {selectedShip.distressInfo.fatalities}
                        </span>
                      </div>
                      <div className="bg-white p-1.5 rounded border border-red-100">
                        <span className="section-label block text-[10px]">Missing</span>
                        <span className="text-xs font-bold font-mono text-red-600 tabular-nums">
                          {selectedShip.distressInfo.missing}
                        </span>
                      </div>
                    </div>

                    <div className="text-[11px] text-slate-600 pt-1">
                      <strong className="text-slate-800">SAR Recommendation:</strong>{' '}
                      {selectedShip.distressInfo.recommendedAction}
                    </div>
                  </div>
                )}

                {/* 5. ROLE SECTION: Command directive form vs Captain response station */}
                <div className="border-t border-[#e3e7ec] pt-3">
                  {role === 'command' ? (
                    <div className="space-y-3">
                      <div className="section-label flex items-center space-x-1.5 text-slate-800">
                        <Navigation size={13} className="text-amber-500" />
                        <span>Issue Tactical Directive</span>
                      </div>

                      <form onSubmit={handleSendDirective} className="space-y-2.5">
                        <div>
                          <label className="block text-[11px] font-medium text-slate-600 mb-1">
                            Directive Action
                          </label>
                          <select
                            value={directiveType}
                            onChange={(e) => setDirectiveType(e.target.value as DirectiveType)}
                            className="w-full bg-slate-50 border border-[#e3e7ec] focus:border-amber-500 rounded-md px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none transition-editorial cursor-pointer"
                          >
                            <option value="REROUTE_PORT">Reroute to safe port</option>
                            <option value="DIVERT_WAYPOINT">Divert to custom coordinates</option>
                            <option value="HOLD_POSITION">Hold position (heave to)</option>
                            <option value="RESUME_ROUTE">Resume standard route</option>
                          </select>
                        </div>

                        {directiveType === 'REROUTE_PORT' && (
                          <div>
                            <label className="block text-[11px] font-medium text-slate-600 mb-1">
                              Safe Target Port
                            </label>
                            <select
                              value={targetPort}
                              onChange={(e) => setTargetPort(e.target.value)}
                              className="w-full bg-slate-50 border border-[#e3e7ec] focus:border-amber-500 rounded-md px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none transition-editorial cursor-pointer"
                            >
                              {ports.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.name} ({p.id})
                                </option>
                              ))}
                            </select>
                          </div>
                        )}

                        {directiveType === 'DIVERT_WAYPOINT' && (
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-[11px] font-medium text-slate-600 mb-1">
                                Lat (°N)
                              </label>
                              <input
                                type="text"
                                value={waypointLat}
                                onChange={(e) => setWaypointLat(e.target.value)}
                                className="w-full bg-slate-50 border border-[#e3e7ec] focus:border-amber-500 rounded-md px-2.5 py-1 text-xs text-slate-800 font-mono focus:outline-none"
                              />
                            </div>
                            <div>
                              <label className="block text-[11px] font-medium text-slate-600 mb-1">
                                Lng (°E)
                              </label>
                              <input
                                type="text"
                                value={waypointLng}
                                onChange={(e) => setWaypointLng(e.target.value)}
                                className="w-full bg-slate-50 border border-[#e3e7ec] focus:border-amber-500 rounded-md px-2.5 py-1 text-xs text-slate-800 font-mono focus:outline-none"
                              />
                            </div>
                          </div>
                        )}

                        <div>
                          <label className="block text-[11px] font-medium text-slate-600 mb-1">
                            Operational Notes / Orders
                          </label>
                          <input
                            type="text"
                            placeholder="e.g. Hostile drones sighted near strait narrows"
                            value={directiveNote}
                            onChange={(e) => setDirectiveNote(e.target.value)}
                            className="w-full bg-slate-50 border border-[#e3e7ec] focus:border-amber-500 rounded-md px-2.5 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none transition-editorial"
                          />
                        </div>

                        <button
                          type="submit"
                          className="w-full py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-md text-xs font-semibold flex items-center justify-center space-x-1.5 shadow-sm transition-editorial cursor-pointer"
                        >
                          <Send size={12} />
                          <span>Transmit Directive</span>
                        </button>
                      </form>
                    </div>
                  ) : isOtherShipInCaptainMode ? (
                    /* Read-Only Traffic Summary: No controls or directives exposed */
                    <div className="bg-slate-50 border border-[#e3e7ec] rounded-lg p-3 space-y-2.5">
                      <div className="flex items-center space-x-1.5 text-xs font-semibold text-slate-700">
                        <Navigation size={13} className="text-slate-400" />
                        <span>Situational Traffic Awareness</span>
                      </div>
                      <p className="text-[11px] leading-relaxed text-slate-500">
                        Viewing <strong>{selectedShip.name} ({selectedShip.shipId})</strong> as read-only traffic. Directives and vessel controls are locked to your assigned command vessel: <strong>{captainShip?.name || captainShipId}</strong>.
                      </p>
                      <button
                        type="button"
                        onClick={() => onSelectShip(captainShipId)}
                        className="w-full py-1.5 mt-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold rounded text-xs transition-editorial cursor-pointer flex items-center justify-center space-x-1.5 shadow-xs"
                      >
                        <span>Return to Assigned Vessel ({captainShip?.name || captainShipId})</span>
                      </button>
                    </div>
                  ) : (
                    /* Captain Station: Response to Directives + Emergency Distress for Assigned Ship */
                    <div className="space-y-3">
                      <div className="section-label flex items-center space-x-1.5 text-slate-800">
                        <Navigation size={13} className="text-indigo-600" />
                        <span>Captain Response Station</span>
                      </div>

                      {directives.filter(
                        (d) => d.shipId === captainShipId && d.status === 'pending'
                      ).length === 0 ? (
                        <div className="text-xs text-slate-500 bg-slate-50 p-2.5 rounded border border-slate-200">
                          No pending directives from Fleet Command.
                        </div>
                      ) : (
                        directives
                          .filter((d) => d.shipId === captainShipId && d.status === 'pending')
                          .map((d) => (
                            <div key={d.id} className="border border-amber-200 bg-amber-50/40 p-2.5 rounded-lg space-y-2">
                              <div className="flex justify-between items-center">
                                <span className="text-xs font-bold text-amber-900">{d.type}</span>
                                <span className="text-[10px] font-semibold uppercase px-1.5 py-0.2 rounded bg-amber-200 text-amber-800 font-mono">
                                  Pending Order
                                </span>
                              </div>
                              {d.targetPort && (
                                <div className="text-xs text-slate-700">
                                  Ordered Port: <strong>{d.targetPort}</strong>
                                </div>
                              )}
                              {d.note && (
                                <div className="text-xs text-slate-600 italic">"{d.note}"</div>
                              )}
                              <button
                                onClick={() => onCaptainRespond('ACCEPT', d.id)}
                                className="w-full py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded font-medium text-xs flex items-center justify-center space-x-1 transition-editorial cursor-pointer shadow-xs"
                              >
                                <CheckCircle2 size={13} />
                                <span>Accept Directive</span>
                              </button>
                            </div>
                          ))
                      )}

                      <button
                        onClick={() => setShowDistressModal(true)}
                        className="w-full py-2 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-md text-xs flex items-center justify-center space-x-1.5 shadow-sm transition-editorial cursor-pointer"
                      >
                        <AlertTriangle size={13} />
                        <span>Broadcast Emergency Distress</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}

        {/* TAB 2: DIRECTIVES */}
        {activeTab === 'directives' && !isOtherShipInCaptainMode && (
          <div className="space-y-3">
            <div className="flex justify-between items-center text-xs pb-1 border-b border-[#e3e7ec]">
              <span className="section-label">Fleet Directives</span>
              <span className="font-mono text-slate-500 tabular-nums">{directives.length} recorded</span>
            </div>

            {directives.length === 0 ? (
              <div className="text-center py-10 text-slate-400 text-xs">
                No fleet directives issued yet.
              </div>
            ) : (
              directives.map((d) => {
                const target = fleet.find((s) => s.shipId === d.shipId);
                const isAccepted = d.status === 'accepted';
                const isDeclined = d.status === 'declined';

                return (
                  <div
                    key={d.id}
                    className="p-3 bg-slate-50 border border-[#e3e7ec] rounded-lg space-y-1.5"
                  >
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-slate-900 text-xs">
                        {target?.name || d.shipId} ({d.shipId})
                      </span>
                      <span
                        className={`text-[10px] font-bold uppercase px-1.5 py-0.2 rounded font-mono ${
                          isAccepted
                            ? 'bg-emerald-100 text-emerald-700'
                            : isDeclined
                            ? 'bg-red-100 text-red-700'
                            : 'bg-amber-100 text-amber-700'
                        }`}
                      >
                        {d.status}
                      </span>
                    </div>

                    <div className="text-xs text-slate-700 font-medium">
                      {d.type.replace('_', ' ')}
                      {d.targetPort && ` → ${d.targetPort}`}
                    </div>

                    {d.note && (
                      <div className="text-slate-600 text-xs italic bg-white p-1.5 rounded border border-slate-200">
                        "{d.note}"
                      </div>
                    )}

                    <div className="text-[10px] text-slate-400 flex justify-between pt-1">
                      <span>{d.issuedBy}</span>
                      <span className="font-mono">{new Date(d.issuedAt).toLocaleTimeString()}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* TAB 3: ALERTS */}
        {activeTab === 'alerts' && !isOtherShipInCaptainMode && (
          <div className="space-y-3">
            <div className="flex justify-between items-center text-xs pb-1 border-b border-[#e3e7ec]">
              <span className="section-label">Operational Alerts</span>
              <span className="font-mono text-slate-500 tabular-nums">{alerts.length} total</span>
            </div>

            {alerts.length === 0 ? (
              <div className="text-center py-10 text-slate-400 text-xs">
                No active or recorded alerts
              </div>
            ) : (
              alerts.map((alert) => {
                const isCritical = alert.priority === 'CRITICAL';
                const isActive = alert.state === 'active';

                return (
                  <div
                    key={alert.id}
                    className={`p-3 rounded-lg border transition-editorial ${
                      isCritical
                        ? 'border-l-4 border-l-red-600 border-red-200 bg-red-50/50'
                        : 'border-l-4 border-l-amber-500 border-slate-200 bg-slate-50'
                    } ${!isActive ? 'opacity-50' : ''}`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span
                        className={`text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.2 rounded font-mono ${
                          isCritical ? 'bg-red-600 text-white' : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {alert.priority} · {alert.type.replace('_', ' ')}
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">
                        {new Date(alert.createdAt).toLocaleTimeString()}
                      </span>
                    </div>

                    <p className="text-xs text-slate-800 font-medium my-1">
                      {alert.message}
                    </p>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-200/80 mt-1">
                      <span className="text-[10px] text-slate-500 capitalize">
                        Status: <strong>{alert.state}</strong>
                      </span>

                      {role === 'command' && isActive && (
                        <div className="flex space-x-1.5">
                          <button
                            onClick={() => onAcknowledgeAlert(alert.id)}
                            className="px-2 py-0.5 text-[10px] font-medium rounded border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 transition-editorial cursor-pointer"
                          >
                            Ack
                          </button>
                          <button
                            onClick={() => onResolveAlert(alert.id)}
                            className="px-2 py-0.5 text-[10px] font-medium rounded bg-slate-900 hover:bg-slate-800 text-white transition-editorial cursor-pointer"
                          >
                            Resolve
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* TAB 4: ZONES */}
        {activeTab === 'zones' && !isOtherShipInCaptainMode && (
          <div className="space-y-3">
            <div className="flex justify-between items-center text-xs pb-1 border-b border-[#e3e7ec]">
              <span className="section-label">Restricted Zones</span>
              <span className="font-mono text-slate-500 tabular-nums">{zones.length} active</span>
            </div>

            {zones.length === 0 ? (
              <div className="text-center py-10 text-slate-400 text-xs">
                No exclusion zones defined.
              </div>
            ) : (
              zones.map((z) => (
                <div
                  key={z.id}
                  className="p-3 bg-red-50/40 border border-red-200 border-l-4 border-l-red-600 rounded-lg space-y-1"
                >
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-red-900 text-xs">{z.name}</span>
                    {role === 'command' && (
                      <button
                        onClick={() => onDeleteZone(z.id)}
                        className="p-1 text-slate-400 hover:text-red-600 transition-editorial cursor-pointer"
                        title="Delete restricted zone"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>

                  <div className="text-xs text-slate-600">{z.reason || 'Military Exclusion Zone'}</div>

                  <div className="flex justify-between text-[10px] text-slate-400 pt-1 font-mono">
                    <span>{z.polygon.length} coordinates</span>
                    <span>{new Date(z.createdAt).toLocaleTimeString()}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Emergency Distress Modal for Captain */}
      {showDistressModal && (
        <div className="fixed inset-0 z-[2000] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl shadow-2xl p-6 max-w-md w-full space-y-4 text-xs text-slate-800">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center space-x-2 text-red-600 font-bold text-sm">
                <AlertTriangle size={18} />
                <span>Emergency Distress Broadcast</span>
              </div>
              <button
                onClick={() => setShowDistressModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Transmit an emergency incident SITREP to Fleet Command. Real-time damage estimation and automated SAR alerts will deploy immediately.
            </p>

            {/* Quick incident templates */}
            <div className="space-y-1.5">
              <span className="section-label">
                Quick Incident Templates
              </span>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() =>
                    setDistressText(
                      'MAYDAY! Anti-ship missile strike on starboard engine room. 3 crew wounded, 1 missing. Fire spreading, cargo crude oil at risk!'
                    )
                  }
                  className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded text-[11px] text-slate-700 font-medium transition-editorial cursor-pointer"
                >
                  Missile Strike
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setDistressText(
                      'Armed skiffs attempting boarding! Gunfire on bridge, crew barricaded in citadel. Requesting immediate naval support!'
                    )
                  }
                  className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded text-[11px] text-slate-700 font-medium transition-editorial cursor-pointer"
                >
                  Armed Boarding
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setDistressText(
                      'Catastrophic electrical blackout. Main propulsion offline, rudder jammed hard to port. Drifting toward restricted waters.'
                    )
                  }
                  className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded text-[11px] text-slate-700 font-medium transition-editorial cursor-pointer"
                >
                  Engine Blackout
                </button>
              </div>
            </div>

            <textarea
              rows={4}
              value={distressText}
              onChange={(e) => setDistressText(e.target.value)}
              placeholder="Describe emergency situation, casualties, hull condition..."
              className="w-full bg-slate-50 border border-slate-200 focus:border-red-500 rounded-lg p-2.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none transition-editorial font-sans"
            />

            <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
              <button
                onClick={() => setShowDistressModal(false)}
                className="px-3.5 py-1.5 border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-medium rounded-md transition-editorial cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleEscalateDistress}
                className="px-4 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-md font-bold text-xs uppercase tracking-wide transition-editorial cursor-pointer shadow-sm"
              >
                Broadcast Distress
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
};
