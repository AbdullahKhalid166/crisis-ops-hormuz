import React, { useState, useRef, useEffect } from 'react';
import {
  Ship,
  Port,
  RestrictedZone,
  Alert as AlertType,
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
import { Button } from './ui/button.tsx';
import { Input } from './ui/input.tsx';
import { Badge } from './ui/badge.tsx';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card.tsx';
import { Alert, AlertTitle, AlertDescription } from './ui/alert.tsx';
import { Tabs, TabsList, TabsTrigger } from './ui/tabs.tsx';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select.tsx';

interface RightPanelProps {
  selectedShip: Ship | null;
  fleet: Ship[];
  ports: Port[];
  zones: RestrictedZone[];
  alerts: AlertType[];
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
        width: 'var(--vessel-card-width, 340px)',
        maxHeight: 'calc(100vh - 56px - 12px - 110px)',
      }}
      className="w-full max-w-full h-full max-h-full bg-[#faf8f5] border border-[#ded9d2] border-l-2 border-l-[#c65d33] rounded-xl shadow-[0_12px_32px_rgba(0,0,0,0.18),0_2px_6px_rgba(0,0,0,0.08)] flex flex-col z-30 select-none overflow-hidden transition-all duration-150"
    >
      {/* Sticky Header with Title & Navigation Tabs */}
      <div className="sticky top-0 z-20 border-b border-[#ded9d2] bg-[#f2ede6] px-3.5 pt-2.5 shrink-0 shadow-xs">
        <div className="flex items-center justify-between pb-1.5">
          <div className="flex items-center space-x-1.5 min-w-0">
            <span className="section-label text-[#1f1f1f] shrink-0">
              {isOtherShipInCaptainMode ? 'Read-Only Summary' : 'Vessel Card'}
            </span>
            {selectedShip && (
              <span className="text-[11px] font-mono text-[#6b6660] font-semibold shrink-0">
                · {selectedShip.shipId}
              </span>
            )}
            {isOtherShipInCaptainMode && (
              <Badge variant="traffic" className="text-[9px] px-1.5 py-0 shrink-0">
                Traffic
              </Badge>
            )}
            {isAssignedCaptainShip && (
              <Badge variant="assigned" className="text-[9px] px-1.5 py-0 shrink-0">
                Assigned
              </Badge>
            )}
          </div>
          {onClose && (
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={onClose}
              className="text-[#6b6660] hover:text-[#1f1f1f] hover:bg-[#ded9d2] shrink-0"
              title="Close vessel card"
            >
              <X size={15} />
            </Button>
          )}
        </div>

        {/* Tab switcher using shadcn Tabs */}
        {isOtherShipInCaptainMode ? (
          <div className="flex items-center space-x-1.5 text-xs font-semibold text-[#6b6660] border-t border-[#ded9d2] pt-1.5 pb-2">
            <span className="w-2 h-2 rounded-full bg-[#ded9d2] shrink-0" />
            <span>Situational Traffic Summary (No Directives / Controls)</span>
          </div>
        ) : (
          <Tabs
            value={activeTab}
            onValueChange={(val) => setActiveTab(val as 'details' | 'alerts' | 'directives' | 'zones')}
            className="w-full border-t border-[#ded9d2] pt-0.5"
          >
            <TabsList className="flex space-x-1 bg-transparent p-0 h-auto">
              {(isCaptainMode
                ? (['details', 'directives'] as const)
                : (['details', 'directives', 'alerts', 'zones'] as const)
              ).map((tab) => (
                <TabsTrigger
                  key={tab}
                  value={tab}
                  className="capitalize py-1 px-2 text-xs flex items-center space-x-1"
                >
                  <span>{tab}</span>
                  {tab === 'alerts' && activeAlertsCount > 0 && (
                    <Badge variant="destructive" className="text-[9px] px-1 py-0 h-4 font-mono">
                      {activeAlertsCount}
                    </Badge>
                  )}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        )}
      </div>

      {/* Scrollable Container with reset scroll on role or ship change */}
      <div
        ref={scrollRef}
        style={{ padding: '14px' }}
        className="flex-1 overflow-y-auto space-y-3 text-xs text-[#1f1f1f]"
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
                <div className="space-y-2 bg-white p-3 rounded-lg border border-[#ded9d2] shadow-xs">
                  <div className="flex items-start justify-between">
                    <div className="min-w-0 mr-2">
                      <div className="flex items-center space-x-2">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: shipCargo?.color }}
                        />
                        <h2 className="font-display font-semibold text-[#1f1f1f] tracking-tight truncate text-sm">
                          {selectedShip.name}
                        </h2>
                      </div>
                      <div className="flex items-center space-x-1.5 mt-0.5">
                        <span className="text-[10px] text-[#6b6660] font-mono">
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
                    <Badge
                      variant={
                        selectedShip.status === 'distressed'
                          ? 'distressed'
                          : selectedShip.status === 'rerouting'
                          ? 'rerouting'
                          : ['insufficient_fuel', 'no_fuel', 'stranded'].includes(selectedShip.status)
                          ? 'destructive'
                          : 'normal'
                      }
                      className="text-[9px] px-1.5 py-0.5 shrink-0"
                    >
                      {selectedShip.status.replace('_', ' ')}
                    </Badge>
                  </div>

                  {selectedShip.inAdverseWeather && (
                    <div className="text-[10px] text-[#9a3412] bg-[#faeee8] border border-[#f5cfbd] rounded px-2 py-1 flex items-center space-x-1.5">
                      <AlertTriangle size={14} className="text-[#c65d33] shrink-0" />
                      <span>Adverse weather · Fuel burn ×1.3</span>
                    </div>
                  )}
                </div>

                {/* 2. THREE STAT TILES: Equal width, min-width, tabular numerals, ~64px high */}
                <div className="grid grid-cols-3 gap-1.5">
                  {/* Speed Tile */}
                  <div className="bg-white border border-[#ded9d2] rounded-lg h-[64px] min-h-[64px] max-h-[64px] p-1.5 flex flex-col justify-between items-center text-center min-w-0 w-full shadow-xs">
                    <div className="section-label flex items-center justify-center space-x-1 text-[10px] text-[#6b6660] leading-none">
                      <Gauge size={12} className="shrink-0" />
                      <span className="truncate">Speed</span>
                    </div>
                    <div className="stat-value text-[#1f1f1f] tabular-nums text-sm font-bold leading-tight">
                      {selectedShip.speed.toFixed(1)}
                    </div>
                    <span className="text-[9px] text-[#8c857b] font-mono leading-none">knots</span>
                  </div>

                  {/* Fuel Tile */}
                  <div className="bg-white border border-[#ded9d2] rounded-lg h-[64px] min-h-[64px] max-h-[64px] p-1.5 flex flex-col justify-between items-center text-center min-w-0 w-full shadow-xs">
                    <div className="section-label flex items-center justify-center space-x-1 text-[10px] text-[#6b6660] leading-none">
                      <Fuel size={12} className="shrink-0" />
                      <span className="truncate">Fuel</span>
                    </div>
                    <div
                      className={`stat-value tabular-nums text-sm font-bold leading-tight ${
                        selectedShip.fuel < 1000 ? 'text-[#dc2626]' : 'text-[#1f1f1f]'
                      }`}
                    >
                      {Math.round(selectedShip.fuel)}
                    </div>
                    <span className="text-[9px] text-[#8c857b] font-mono leading-none">tons</span>
                  </div>

                  {/* ETA Tile: Never truncates; wraps or formats cleanly */}
                  <div className="bg-white border border-[#ded9d2] rounded-lg h-[64px] min-h-[64px] max-h-[64px] p-1.5 flex flex-col justify-between items-center text-center min-w-0 w-full shadow-xs">
                    <div className="section-label flex items-center justify-center space-x-1 text-[10px] text-[#6b6660] leading-none">
                      <Clock size={12} className="shrink-0" />
                      <span className="truncate">ETA</span>
                    </div>
                    <div className="font-mono font-bold text-[#1f1f1f] tabular-nums text-xs leading-tight text-center truncate w-full">
                      {formatEta(selectedShip.etaSeconds)}
                    </div>
                    <span className="text-[9px] text-[#8c857b] truncate leading-none w-full block">
                      {selectedShip.destinationPortName || selectedShip.destination}
                    </span>
                  </div>
                </div>

                {/* 3. TELEMETRY & ROUTING */}
                <div className="border-t border-[#ded9d2] pt-2">
                  <span className="section-label block mb-1 text-[11px] text-[#6b6660]">
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
                    <Badge
                      variant={selectedShip.canReachDestination ? 'success' : 'critical'}
                      className="text-[10px] px-1.5 py-0.5"
                    >
                      {selectedShip.canReachDestination ? 'Viable' : 'Fuel Deficit'}
                    </Badge>
                  </div>
                </div>

                {/* 4. DISTRESS REPORT (if distressed) using shadcn Alert */}
                {selectedShip.status === 'distressed' && selectedShip.distressInfo && (
                  <Alert variant="destructive" className="space-y-2 border-red-200 bg-red-50/50">
                    <div className="flex items-center justify-between border-b border-red-200/80 pb-1">
                      <div className="flex items-center space-x-1.5 text-red-700 font-semibold text-xs">
                        <AlertTriangle size={16} className="text-red-600" />
                        <AlertTitle className="text-xs font-semibold m-0">Incident Distress Report</AlertTitle>
                      </div>
                      <Badge variant="outline" className="text-[9px] font-mono text-red-600 bg-white">
                        {selectedShip.distressInfo.source === 'ai' ? 'GEMINI 3.8 FLASH' : 'LOCAL NLP'}
                      </Badge>
                    </div>

                    <div className="font-semibold text-slate-900 text-xs">
                      {selectedShip.distressInfo.incidentType}
                    </div>

                    <AlertDescription className="text-[11px] text-slate-700 italic bg-white/70 p-2 rounded border border-red-100 leading-relaxed">
                      "{selectedShip.distressInfo.summary}"
                    </AlertDescription>

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
                  </Alert>
                )}

                {/* 5. ROLE SECTION: Command directive form vs Captain response station */}
                <div className="border-t border-[#e3e7ec] pt-3">
                  {role === 'command' ? (
                    <div className="space-y-3">
                      <div className="section-label flex items-center space-x-1.5 text-slate-800">
                        <Navigation size={14} className="text-amber-500" />
                        <span>Issue Tactical Directive</span>
                      </div>

                      <form onSubmit={handleSendDirective} className="space-y-2.5">
                        <div>
                          <label className="block text-[11px] font-medium text-slate-600 mb-1">
                            Directive Action
                          </label>
                          <Select
                            value={directiveType}
                            onValueChange={(val) => setDirectiveType(val as DirectiveType)}
                          >
                            <SelectTrigger className="w-full h-8 text-xs bg-slate-50 border-[#e3e7ec]">
                              <SelectValue placeholder="Select action" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="REROUTE_PORT">Reroute to safe port</SelectItem>
                              <SelectItem value="DIVERT_WAYPOINT">Divert to custom coordinates</SelectItem>
                              <SelectItem value="HOLD_POSITION">Hold position (heave to)</SelectItem>
                              <SelectItem value="RESUME_ROUTE">Resume standard route</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        {directiveType === 'REROUTE_PORT' && (
                          <div>
                            <label className="block text-[11px] font-medium text-slate-600 mb-1">
                              Safe Target Port
                            </label>
                            <Select value={targetPort} onValueChange={setTargetPort}>
                              <SelectTrigger className="w-full h-8 text-xs bg-slate-50 border-[#e3e7ec]">
                                <SelectValue placeholder="Select port" />
                              </SelectTrigger>
                              <SelectContent>
                                {ports.map((p) => (
                                  <SelectItem key={p.id} value={p.id}>
                                    {p.name} ({p.id})
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        )}

                        {directiveType === 'DIVERT_WAYPOINT' && (
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-[11px] font-medium text-slate-600 mb-1">
                                Lat (°N)
                              </label>
                              <Input
                                type="text"
                                value={waypointLat}
                                onChange={(e) => setWaypointLat(e.target.value)}
                                className="h-8 bg-slate-50 text-xs font-mono"
                              />
                            </div>
                            <div>
                              <label className="block text-[11px] font-medium text-slate-600 mb-1">
                                Lng (°E)
                              </label>
                              <Input
                                type="text"
                                value={waypointLng}
                                onChange={(e) => setWaypointLng(e.target.value)}
                                className="h-8 bg-slate-50 text-xs font-mono"
                              />
                            </div>
                          </div>
                        )}

                        <div>
                          <label className="block text-[11px] font-medium text-slate-600 mb-1">
                            Operational Notes / Orders
                          </label>
                          <Input
                            type="text"
                            placeholder="e.g. Hostile drones sighted near strait narrows"
                            value={directiveNote}
                            onChange={(e) => setDirectiveNote(e.target.value)}
                            className="h-8 bg-slate-50 text-xs placeholder:text-slate-400"
                          />
                        </div>

                        <Button
                          type="submit"
                          variant="default"
                          className="w-full h-8 text-xs font-semibold flex items-center justify-center space-x-1.5 shadow-sm"
                        >
                          <Send size={14} />
                          <span>Transmit Directive</span>
                        </Button>
                      </form>
                    </div>
                  ) : isOtherShipInCaptainMode ? (
                    /* Read-Only Traffic Summary: No controls or directives exposed */
                    <div className="bg-slate-50 border border-[#e3e7ec] rounded-lg p-3 space-y-2.5">
                      <div className="flex items-center space-x-1.5 text-xs font-semibold text-slate-700">
                        <Navigation size={14} className="text-slate-400" />
                        <span>Situational Traffic Awareness</span>
                      </div>
                      <p className="text-[11px] leading-relaxed text-slate-500">
                        Viewing <strong>{selectedShip.name} ({selectedShip.shipId})</strong> as read-only traffic. Directives and vessel controls are locked to your assigned command vessel: <strong>{captainShip?.name || captainShipId}</strong>.
                      </p>
                      <Button
                        type="button"
                        variant="primary"
                        onClick={() => onSelectShip(captainShipId)}
                        className="w-full h-8 text-xs font-semibold shadow-xs"
                      >
                        Return to Assigned Vessel ({captainShip?.name || captainShipId})
                      </Button>
                    </div>
                  ) : (
                    /* Captain Station: Response to Directives + Emergency Distress for Assigned Ship */
                    <div className="space-y-3">
                      <div className="section-label flex items-center space-x-1.5 text-slate-800">
                        <Navigation size={14} className="text-indigo-600" />
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
                                <Badge variant="warning" className="text-[10px] font-mono">
                                  Pending Order
                                </Badge>
                              </div>
                              {d.targetPort && (
                                <div className="text-xs text-slate-700">
                                  Ordered Port: <strong>{d.targetPort}</strong>
                                </div>
                              )}
                              {d.note && (
                                <div className="text-xs text-slate-600 italic">"{d.note}"</div>
                              )}
                              <Button
                                onClick={() => onCaptainRespond('ACCEPT', d.id)}
                                className="w-full h-8 bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs flex items-center justify-center space-x-1 shadow-xs"
                              >
                                <CheckCircle2 size={15} />
                                <span>Accept Directive</span>
                              </Button>
                            </div>
                          ))
                      )}

                      <Button
                        onClick={() => setShowDistressModal(true)}
                        variant="destructive"
                        className="w-full h-9 text-xs font-semibold flex items-center justify-center space-x-1.5 shadow-sm"
                      >
                        <AlertTriangle size={15} />
                        <span>Broadcast Emergency Distress</span>
                      </Button>
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
                  <Card key={d.id} className="p-3 bg-slate-50 border-[#e3e7ec] space-y-1.5">
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-slate-900 text-xs">
                        {target?.name || d.shipId} ({d.shipId})
                      </span>
                      <Badge
                        variant={
                          isAccepted
                            ? 'normal'
                            : isDeclined
                            ? 'critical'
                            : 'warning'
                        }
                        className="text-[10px] font-mono"
                      >
                        {d.status}
                      </Badge>
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
                  </Card>
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
                  <Alert
                    key={alert.id}
                    variant={isCritical ? 'critical' : 'warning'}
                    className={`transition-colors ${!isActive ? 'opacity-50' : ''}`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <Badge
                        variant={isCritical ? 'distressed' : 'warning'}
                        className="text-[10px] font-mono"
                      >
                        {alert.priority} · {alert.type.replace('_', ' ')}
                      </Badge>
                      <span className="text-[10px] text-slate-400 font-mono">
                        {new Date(alert.createdAt).toLocaleTimeString()}
                      </span>
                    </div>

                    <AlertDescription className="text-xs font-semibold text-slate-800 my-1">
                      {alert.message}
                    </AlertDescription>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-200/80 mt-1">
                      <span className="text-[10px] text-slate-500 capitalize">
                        Status: <strong>{alert.state}</strong>
                      </span>

                      {role === 'command' && isActive && (
                        <div className="flex space-x-1.5">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => onAcknowledgeAlert(alert.id)}
                            className="h-7 px-2.5 text-xs font-medium"
                          >
                            Ack
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => onResolveAlert(alert.id)}
                            className="h-7 px-2.5 text-xs font-medium"
                          >
                            Resolve
                          </Button>
                        </div>
                      )}
                    </div>
                  </Alert>
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
                <Alert
                  key={z.id}
                  variant="critical"
                  className="bg-red-50/40 border-red-200 space-y-1"
                >
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-red-900 text-xs">{z.name}</span>
                    {role === 'command' && (
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => onDeleteZone(z.id)}
                        className="text-slate-400 hover:text-red-600"
                        title="Delete restricted zone"
                      >
                        <Trash2 size={14} />
                      </Button>
                    )}
                  </div>

                  <div className="text-xs text-slate-600">{z.reason || 'Military Exclusion Zone'}</div>

                  <div className="flex justify-between text-[10px] text-slate-400 pt-1 font-mono">
                    <span>{z.polygon.length} coordinates</span>
                    <span>{new Date(z.createdAt).toLocaleTimeString()}</span>
                  </div>
                </Alert>
              ))
            )}
          </div>
        )}
      </div>

      {/* Emergency Distress Modal for Captain */}
      {showDistressModal && (
        <div className="fixed inset-0 z-[2000] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <Card className="max-w-md w-full p-5 space-y-4 shadow-2xl border-slate-200 text-xs text-slate-800">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center space-x-2 text-red-600 font-bold text-sm">
                <AlertTriangle size={20} />
                <span>Emergency Distress Broadcast</span>
              </div>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => setShowDistressModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X size={16} />
              </Button>
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
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  onClick={() =>
                    setDistressText(
                      'MAYDAY! Anti-ship missile strike on starboard engine room. 3 crew wounded, 1 missing. Fire spreading, cargo crude oil at risk!'
                    )
                  }
                  className="h-7 text-[11px]"
                >
                  Missile Strike
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  onClick={() =>
                    setDistressText(
                      'Armed skiffs attempting boarding! Gunfire on bridge, crew barricaded in citadel. Requesting immediate naval support!'
                    )
                  }
                  className="h-7 text-[11px]"
                >
                  Armed Boarding
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  onClick={() =>
                    setDistressText(
                      'Catastrophic electrical blackout. Main propulsion offline, rudder jammed hard to port. Drifting toward restricted waters.'
                    )
                  }
                  className="h-7 text-[11px]"
                >
                  Engine Blackout
                </Button>
              </div>
            </div>

            <textarea
              rows={4}
              value={distressText}
              onChange={(e) => setDistressText(e.target.value)}
              placeholder="Describe emergency situation, casualties, hull condition..."
              className="w-full bg-slate-50 border border-slate-200 focus:border-red-500 rounded-lg p-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none font-sans"
            />

            <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowDistressModal(false)}
                className="text-xs"
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleEscalateDistress}
                className="text-xs font-bold uppercase tracking-wide"
              >
                Broadcast Distress
              </Button>
            </div>
          </Card>
        </div>
      )}
    </aside>
  );
};
