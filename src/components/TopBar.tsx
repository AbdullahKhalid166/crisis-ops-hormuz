import React, { useState, useRef, useEffect } from 'react';
import {
  Ship,
  Port,
  Alert,
  Role,
} from '../types.ts';
import {
  Search,
  Bell,
  Volume2,
  VolumeX,
  Compass,
  Radio,
  Navigation,
  X,
  Ship as ShipIcon,
  ChevronDown,
  Check,
} from 'lucide-react';
import { getCargoInfo } from '../utils/cargoTheme.ts';

interface TopBarProps {
  role: Role;
  captainShipId: string;
  fleet: Ship[];
  ports: Port[];
  onSwitchRole: (newRole: Role, newShipId?: string) => void;
  connected: boolean;
  latencyMs: number | null;
  alerts: Alert[];
  muted: boolean;
  onToggleMute: () => void;
  onToggleLeftRail?: () => void;
  onSelectShip: (shipId: string) => void;
  onSelectPort?: (portId: string) => void;
  onAcknowledgeAlert: (alertId: string) => void;
  onResolveAlert: (alertId: string) => void;
  onOpenAlertsTab: () => void;
  onAlertMenuVisibilityChange?: (isOpen: boolean) => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  role,
  captainShipId,
  fleet,
  ports,
  onSwitchRole,
  connected,
  latencyMs,
  alerts,
  muted,
  onToggleMute,
  onToggleLeftRail,
  onSelectShip,
  onAcknowledgeAlert,
  onResolveAlert,
  onOpenAlertsTab,
  onAlertMenuVisibilityChange,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isAlertMenuOpen, setIsAlertMenuOpen] = useState(false);
  const setAlertMenuOpen = (isOpen: boolean) => {
    setIsAlertMenuOpen(isOpen);
    onAlertMenuVisibilityChange?.(isOpen);
  };

  // Captain vessel popover state
  const [isCaptainPopoverOpen, setIsCaptainPopoverOpen] = useState(false);
  const [captainFilterQuery, setCaptainFilterQuery] = useState('');

  // Command vessel chip hover breakdown state
  const [isFleetHovered, setIsFleetHovered] = useState(false);
  const fleetHoverCloseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Window resize tracking for responsive collapse (<1280 subtitle hide, <1100 search icon collapse)
  const [windowWidth, setWindowWidth] = useState<number>(() =>
    typeof window !== 'undefined' ? window.innerWidth : 1440
  );

  const searchRef = useRef<HTMLDivElement>(null);
  const alertMenuRef = useRef<HTMLDivElement>(null);
  const captainPopoverRef = useRef<HTMLDivElement>(null);
  const fleetChipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const isUnder1100 = windowWidth < 1100;
  const isUnder1280 = windowWidth < 1280;

  const activeAlerts = alerts.filter((a) => a.state === 'active');
  const criticalCount = activeAlerts.filter((a) => a.priority === 'CRITICAL').length;

  const captainShip = fleet.find((s) => s.shipId === captainShipId) || fleet[0];

  const keepFleetPopoverOpen = () => {
    if (fleetHoverCloseTimeoutRef.current) {
      clearTimeout(fleetHoverCloseTimeoutRef.current);
      fleetHoverCloseTimeoutRef.current = null;
    }
    setIsFleetHovered(true);
  };

  const delayFleetPopoverClose = () => {
    if (fleetHoverCloseTimeoutRef.current) clearTimeout(fleetHoverCloseTimeoutRef.current);
    fleetHoverCloseTimeoutRef.current = setTimeout(() => {
      setIsFleetHovered(false);
      fleetHoverCloseTimeoutRef.current = null;
    }, 150);
  };

  // Fleet status counts for hover breakdown in Command mode
  const distressedCount = fleet.filter((s) => s.status === 'distressed').length;
  const reroutingCount = fleet.filter((s) => s.status === 'rerouting').length;
  const normalCount = fleet.filter(
    (s) => s.status !== 'distressed' && s.status !== 'rerouting'
  ).length;

  // Sort fleet numerically MV-1 to MV-15
  const sortedFleet = [...fleet].sort((a, b) => {
    const numA = parseInt(a.shipId.replace(/\D/g, ''), 10) || 0;
    const numB = parseInt(b.shipId.replace(/\D/g, ''), 10) || 0;
    return numA - numB;
  });

  // Filter vessels in captain popover
  const captainFilteredFleet = sortedFleet.filter((s) => {
    if (!captainFilterQuery.trim()) return true;
    const q = captainFilterQuery.toLowerCase();
    return (
      s.name.toLowerCase().includes(q) ||
      s.shipId.toLowerCase().includes(q) ||
      s.destination.toLowerCase().includes(q) ||
      s.cargo.toLowerCase().includes(q)
    );
  });

  // Global search filtering
  const filteredShips = searchQuery.trim()
    ? fleet.filter(
        (s) =>
          s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          s.shipId.toLowerCase().includes(searchQuery.toLowerCase()) ||
          s.cargo.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : [];

  const filteredPorts = searchQuery.trim()
    ? ports.filter(
        (p) =>
          p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          p.id.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : [];

  // Close popovers on click outside or Esc key
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setIsSearchOpen(false);
      }
      if (alertMenuRef.current && !alertMenuRef.current.contains(e.target as Node)) {
        setAlertMenuOpen(false);
      }
      if (
        captainPopoverRef.current &&
        !captainPopoverRef.current.contains(e.target as Node)
      ) {
        setIsCaptainPopoverOpen(false);
      }
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setIsSearchOpen(false);
        setAlertMenuOpen(false);
        setIsCaptainPopoverOpen(false);
        setIsFleetHovered(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  return (
    <header
      style={{
        display: 'grid',
        gridTemplateColumns: isUnder1100
          ? 'minmax(0, 240px) 40px 216px 260px 40px 40px 96px'
          : '240px minmax(180px, 1fr) 216px 260px 40px 40px 96px',
        columnGap: '12px',
        height: '56px',
        padding: '0 16px',
      }}
      className="bg-[#0f1b2d] text-white items-center z-50 select-none shadow-md border-b border-[#1e2d42] shrink-0"
    >
      {/* 1. LOGO (240px, under 1280px hide subtitle, under 1100px minmax(0, 240px) prevents any overflow) */}
      <div className="flex items-center space-x-2.5 h-10 overflow-hidden min-w-0">
        <div className="w-8 h-8 rounded-lg bg-amber-500 flex items-center justify-center text-[#0f1b2d] shadow-sm shrink-0">
          <Compass size={18} strokeWidth={2.5} />
        </div>
        <div className="flex flex-col justify-center min-w-0">
          <div className="flex items-center space-x-1.5 leading-none">
            <span className="font-bold tracking-wider text-xs sm:text-sm font-mono text-white whitespace-nowrap">
              MARITIME TAC-OPS
            </span>
            <span className="px-1 py-0.2 rounded text-[9px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/40 shrink-0">
              LIVE
            </span>
          </div>
          {!isUnder1280 && (
            <span className="text-[10px] text-slate-400 font-mono tracking-tight whitespace-nowrap overflow-hidden text-ellipsis mt-0.5">
              Global Fleet Tracking & Directive Control
            </span>
          )}
        </div>
      </div>

      {/* 2. SEARCH (flex min 180px, collapses into 40px icon button under 1100px) */}
      <div ref={searchRef} className="relative h-10 min-w-0">
        {isUnder1100 ? (
          /* Collapsed Search Icon Button (40px tall, 40px wide) */
          <>
            <button
              onClick={() => setIsSearchOpen((prev) => !prev)}
              aria-label="Search fleet and ports"
              title="Search vessels and ports"
              className={`w-10 h-10 rounded-lg border flex items-center justify-center transition-editorial cursor-pointer shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 active:scale-[0.96] ${
                isSearchOpen || searchQuery
                  ? 'bg-amber-500 text-slate-950 border-amber-400'
                  : 'bg-[#18263a] hover:bg-[#1f3048] border-slate-700/80 text-slate-300 hover:text-white'
              }`}
            >
              <Search size={18} />
            </button>

            {/* Collapsed Search Dropdown Popover */}
            {isSearchOpen && (
              <div className="absolute left-0 top-12 w-80 bg-white text-[#111827] rounded-lg shadow-2xl border border-slate-200 p-2 z-50">
                <div className="relative flex items-center mb-2">
                  <Search size={15} className="absolute left-3 text-slate-400 pointer-events-none" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search vessels or ports..."
                    autoFocus
                    className="w-full h-9 pl-9 pr-8 bg-slate-50 border border-slate-300 focus:border-amber-500 rounded-md text-xs text-slate-900 placeholder-slate-400 focus:outline-none"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2.5 text-slate-400 hover:text-slate-700"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>

                {filteredShips.length > 0 && (
                  <div className="max-h-48 overflow-y-auto divide-y divide-slate-100">
                    <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400 bg-slate-50">
                      Vessels ({filteredShips.length})
                    </div>
                    {filteredShips.map((s) => {
                      const cargo = getCargoInfo(s.cargo);
                      return (
                        <button
                          key={s.shipId}
                          onClick={() => {
                            onSelectShip(s.shipId);
                            setIsSearchOpen(false);
                          }}
                          className="w-full px-2 py-1.5 hover:bg-amber-50 text-left flex items-center justify-between text-xs transition-editorial"
                        >
                          <div className="flex items-center space-x-2 truncate">
                            <span
                              className="w-2.5 h-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: cargo.color }}
                            />
                            <span className="font-semibold text-slate-800 truncate">{s.name}</span>
                            <span className="text-[10px] text-slate-500 font-mono">({s.shipId})</span>
                          </div>
                          <span className="text-[10px] text-slate-500 capitalize">{s.status}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          /* Expanded Full Search Bar (h-10, min 180px, text-overflow: ellipsis) */
          <div className="relative flex items-center h-10 w-full min-w-0">
            <Search size={16} className="absolute left-3 text-slate-400 pointer-events-none shrink-0" />
            <input
              type="text"
              placeholder="Search vessels (e.g. Aurora, LNG, MV-1) or ports..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setIsSearchOpen(true);
              }}
              onFocus={() => setIsSearchOpen(true)}
              className="w-full h-10 pl-9 pr-8 bg-[#18263a] hover:bg-[#1f3048] focus:bg-[#1f3048] border border-slate-700/80 focus:border-amber-400 focus-visible:ring-2 focus-visible:ring-amber-400 rounded-lg text-[13px] text-white placeholder-slate-400 focus:outline-none transition-editorial shadow-inner truncate min-w-0"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setIsSearchOpen(false);
                }}
                className="absolute right-2.5 text-slate-400 hover:text-white p-0.5 rounded cursor-pointer"
                aria-label="Clear search"
              >
                <X size={15} />
              </button>
            )}

            {/* Expanded Search Dropdown Results */}
            {isSearchOpen && (filteredShips.length > 0 || filteredPorts.length > 0) && (
              <div className="absolute top-12 inset-x-0 bg-white text-[#111827] rounded-lg shadow-xl border border-slate-200 py-1.5 z-50 max-h-80 overflow-y-auto">
                {filteredShips.length > 0 && (
                  <div>
                    <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400 bg-slate-50">
                      Vessels ({filteredShips.length})
                    </div>
                    {filteredShips.map((s) => {
                      const cargo = getCargoInfo(s.cargo);
                      return (
                        <button
                          key={s.shipId}
                          onClick={() => {
                            onSelectShip(s.shipId);
                            setIsSearchOpen(false);
                          }}
                          className="w-full px-3 py-2 hover:bg-amber-50 text-left flex items-center justify-between text-xs transition-editorial border-b border-slate-100 last:border-0 cursor-pointer"
                        >
                          <div className="flex items-center space-x-2 truncate">
                            <span
                              className="w-2.5 h-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: cargo.color }}
                            />
                            <span className="font-semibold text-slate-800">{s.name}</span>
                            <span className="text-[10px] text-slate-500 font-mono">({s.shipId})</span>
                            <span className="text-[10px] text-slate-400">· {cargo.label}</span>
                          </div>
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-medium uppercase ${
                              s.status === 'distressed'
                                ? 'bg-red-100 text-red-700'
                                : s.status === 'rerouting'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {s.status}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {filteredPorts.length > 0 && (
                  <div>
                    <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400 bg-slate-50 border-t border-slate-100">
                      Ports ({filteredPorts.length})
                    </div>
                    {filteredPorts.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => setIsSearchOpen(false)}
                        className="w-full px-3 py-2 hover:bg-slate-50 text-left flex items-center justify-between text-xs transition-editorial cursor-pointer"
                      >
                        <span className="font-medium text-slate-800">{p.name}</span>
                        <span className="text-[10px] text-slate-500 font-mono">{p.id}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 3. ROLE TOGGLE (Fixed 216px container, 2 segments of exactly 104px each, 40px tall) */}
      <div
        role="tablist"
        aria-label="Operating Role"
        className="w-[216px] h-10 p-1 flex items-center bg-[#142032] border border-slate-700/80 rounded-lg shrink-0 select-none"
      >
        <button
          role="tab"
          aria-selected={role === 'command'}
          onClick={() => onSwitchRole('command')}
          className={`w-[104px] h-full rounded-md text-[14px] font-medium transition-all flex items-center justify-center space-x-1.5 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1 focus-visible:ring-offset-[#142032] active:scale-[0.97] active:brightness-95 ${
            role === 'command'
              ? 'bg-[#f59e0b] text-[#0f1b2d] font-semibold shadow-xs'
              : 'bg-transparent text-white/80 hover:text-white hover:bg-white/10 active:bg-white/15'
          }`}
        >
          <Radio size={15} />
          <span>Command</span>
        </button>
        <button
          role="tab"
          aria-selected={role === 'captain'}
          onClick={() => onSwitchRole('captain', captainShipId)}
          className={`w-[104px] h-full rounded-md text-[14px] font-medium transition-all flex items-center justify-center space-x-1.5 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1 focus-visible:ring-offset-[#142032] active:scale-[0.97] active:brightness-95 ${
            role === 'captain'
              ? 'bg-[#f59e0b] text-[#0f1b2d] font-semibold shadow-xs'
              : 'bg-transparent text-white/80 hover:text-white hover:bg-white/10 active:bg-white/15'
          }`}
        >
          <Navigation size={15} />
          <span>Captain</span>
        </button>
      </div>

      {/* 4. VESSEL SLOT (Fixed 260px width, 40px tall in both roles) */}
      <div className="w-[260px] h-10 relative shrink-0">
        {role === 'command' ? (
          /* Command Mode: Non-editable chip "Fleet · 15 vessels", click toggles left fleet rail, hover shows breakdown */
          <div
            ref={fleetChipRef}
            onMouseEnter={keepFleetPopoverOpen}
            onMouseLeave={delayFleetPopoverClose}
            onFocus={keepFleetPopoverOpen}
            onBlur={delayFleetPopoverClose}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setIsFleetHovered(false);
            }}
            className="w-full h-full relative"
          >
            <button
              type="button"
              onClick={() => onToggleLeftRail?.()}
              title="Click to toggle left fleet panel"
              className="w-full h-full bg-[#18263a] hover:bg-[#1f3048] border border-slate-700/80 hover:border-slate-500 rounded-lg px-3 flex items-center justify-between text-white text-[13px] font-medium transition-editorial cursor-pointer select-none active:scale-[0.98] shadow-xs"
            >
              <div className="flex items-center space-x-2 truncate">
                <ShipIcon size={16} className="text-amber-400 shrink-0" />
                <span className="font-semibold text-slate-200 truncate">
                  Fleet · {fleet.length || 15} vessels
                </span>
              </div>
              <span className="text-[11px] font-mono text-slate-400 shrink-0">
                {fleet.length || 15} active
              </span>
            </button>

            {/* Live Status Breakdown on Hover */}
            {isFleetHovered && (
              <div className="absolute right-0 top-[calc(100%+8px)] w-[264px] bg-white text-[#111827] border border-[#e3e7ec] rounded-[6px] p-2.5 shadow-[0_8px_24px_rgba(15,23,42,0.14)] z-[60] text-xs pointer-events-auto">
                <div className="flex items-center justify-between pb-1.5 border-b border-[#e3e7ec] text-[13px]">
                  <span>Fleet status</span>
                  <span className="font-normal text-[#6b7280]">{fleet.length} vessels</span>
                </div>
                <div className="grid grid-cols-3 gap-2 pt-2 text-center">
                  <div className="min-w-0 bg-[#ecfdf5] text-[#166534] rounded p-1.5">
                    <div className="font-semibold tabular-nums text-[20px] leading-tight">
                      {normalCount}
                    </div>
                    <div className="min-w-0 text-[11px] leading-tight">Normal</div>
                  </div>
                  <div className="min-w-0 bg-[#fffbeb] text-[#92400e] rounded p-1.5">
                    <div className="font-semibold tabular-nums text-[20px] leading-tight">
                      {reroutingCount}
                    </div>
                    <div className="min-w-0 text-[11px] leading-tight">Rerouting</div>
                  </div>
                  <div className="min-w-0 bg-[#fef2f2] text-[#991b1b] rounded p-1.5">
                    <div className="font-semibold tabular-nums text-[20px] leading-tight">
                      {distressedCount}
                    </div>
                    <div className="min-w-0 text-[11px] leading-tight">Distress</div>
                  </div>
                </div>
                <div className="text-[11px] text-[#6b7280] text-center pt-2 mt-1.5 border-t border-[#e3e7ec]">
                  Click to open/close left fleet panel
                </div>
              </div>
            )}
          </div>
        ) : (
          /* Captain Mode: Dropdown button "Select vessel: Aurora (MV-1)" with search popover */
          <div ref={captainPopoverRef} className="w-full h-full relative">
            <button
              type="button"
              onClick={() => setIsCaptainPopoverOpen((prev) => !prev)}
              aria-haspopup="listbox"
              aria-expanded={isCaptainPopoverOpen}
              className="w-full h-full bg-[#18263a] hover:bg-[#1f3048] border border-amber-500/80 hover:border-amber-400 rounded-lg px-3 flex items-center justify-between text-white text-[13px] font-medium transition-editorial cursor-pointer select-none active:scale-[0.98] shadow-xs"
            >
              <div className="flex items-center space-x-1.5 truncate">
                <Navigation size={14} className="text-amber-400 shrink-0" />
                <span className="truncate">
                  Select vessel: {captainShip?.name || 'Aurora'} ({captainShip?.shipId || captainShipId})
                </span>
              </div>
              <ChevronDown
                size={14}
                className={`text-amber-400 shrink-0 ml-1 transition-transform ${
                  isCaptainPopoverOpen ? 'rotate-180' : ''
                }`}
              />
            </button>

            {/* Captain Vessel Popover List (max-height 60vh, scrollable, search at top, right-aligned) */}
            {isCaptainPopoverOpen && (
              <div className="absolute right-0 top-12 w-80 sm:w-96 max-h-[60vh] bg-[#0f1b2d] border border-slate-700 rounded-lg shadow-2xl z-50 flex flex-col overflow-hidden text-xs">
                {/* Popover Header & Search Input */}
                <div className="p-2.5 border-b border-slate-700/80 bg-[#142032] shrink-0">
                  <div className="relative flex items-center">
                    <Search size={14} className="absolute left-2.5 text-slate-400 pointer-events-none" />
                    <input
                      type="text"
                      value={captainFilterQuery}
                      onChange={(e) => setCaptainFilterQuery(e.target.value)}
                      placeholder="Filter all 15 fleet vessels..."
                      autoFocus
                      className="w-full h-8 pl-8 pr-7 bg-[#18263a] border border-slate-700 focus:border-amber-400 rounded text-xs text-white placeholder-slate-400 focus:outline-none"
                    />
                    {captainFilterQuery && (
                      <button
                        onClick={() => setCaptainFilterQuery('')}
                        className="absolute right-2 text-slate-400 hover:text-white"
                      >
                        <X size={13} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Popover Scrollable Vessel Rows */}
                <div
                  role="listbox"
                  className="flex-1 overflow-y-auto max-h-[calc(60vh-50px)] divide-y divide-slate-800/80 p-1"
                >
                  {captainFilteredFleet.map((s) => {
                    const cargo = getCargoInfo(s.cargo);
                    const isCurrent = s.shipId === captainShipId;
                    const isDistressed = s.status === 'distressed';
                    const isRerouting = s.status === 'rerouting';

                    return (
                      <button
                        key={s.shipId}
                        role="option"
                        aria-selected={isCurrent}
                        onClick={() => {
                          onSwitchRole('captain', s.shipId);
                          setIsCaptainPopoverOpen(false);
                        }}
                        className={`w-full px-3 py-2 text-left rounded flex items-center justify-between transition-editorial cursor-pointer ${
                          isCurrent
                            ? 'bg-amber-500/20 text-white border border-amber-500/40'
                            : 'hover:bg-slate-800/70 text-slate-200'
                        }`}
                      >
                        <div className="flex items-center space-x-2.5 min-w-0 mr-2">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: cargo.color }}
                          />
                          <div className="truncate">
                            <div className="flex items-center space-x-1.5 leading-tight">
                              <span className="font-semibold text-white truncate text-xs">
                                {s.name}
                              </span>
                              <span className="font-mono text-[11px] text-slate-400 shrink-0">
                                ({s.shipId})
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-400 truncate mt-0.5">
                              to {s.destination} · {cargo.label}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center space-x-2 shrink-0">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-medium capitalize ${
                              isDistressed
                                ? 'bg-red-500/20 text-red-300 border border-red-500/40'
                                : isRerouting
                                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                                : 'bg-slate-800 text-slate-300 border border-slate-700'
                            }`}
                          >
                            {s.status}
                          </span>
                          {isCurrent && <Check size={14} className="text-amber-400" />}
                        </div>
                      </button>
                    );
                  })}

                  {captainFilteredFleet.length === 0 && (
                    <div className="p-4 text-center text-slate-400 text-xs">
                      No vessels matching "{captainFilterQuery}"
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 5. ALERT BELL (Fixed 40px wide, 40px tall in both roles) */}
      <div className="w-10 h-10 relative shrink-0" ref={alertMenuRef}>
        <button
          onClick={() => setAlertMenuOpen(!isAlertMenuOpen)}
          className={`w-10 h-10 rounded-lg transition-editorial flex items-center justify-center cursor-pointer border shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 active:scale-[0.96] ${
            activeAlerts.length > 0
              ? criticalCount > 0
                ? 'bg-red-600/20 border-red-500 text-red-400 hover:bg-red-600/30'
                : 'bg-amber-500/20 border-amber-500 text-amber-300 hover:bg-amber-500/30'
              : 'border-slate-700/80 text-slate-300 hover:text-white hover:bg-slate-800'
          }`}
          title={`${activeAlerts.length} active alerts`}
          aria-label={`${activeAlerts.length} active alerts`}
        >
          <Bell size={18} />
          {activeAlerts.length > 0 && (
            <span
              className={`absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center text-white ${
                criticalCount > 0 ? 'bg-red-600 animate-pulse' : 'bg-amber-500'
              }`}
            >
              {activeAlerts.length}
            </span>
          )}
        </button>

        {/* Alert Dropdown */}
        {isAlertMenuOpen && (
          <div className="absolute right-0 top-12 w-[320px] bg-white text-[#111827] rounded-lg shadow-2xl border border-slate-200 z-[1400] overflow-hidden">
            <div className="px-2.5 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <span className="font-semibold text-[12px] text-slate-900">Maritime Alerts</span>
                {criticalCount > 0 && (
                  <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-red-100 text-red-700">
                    {criticalCount} Critical
                  </span>
                )}
              </div>
            </div>

            <div className="max-h-[60vh] overflow-y-auto divide-y divide-slate-100">
              {activeAlerts.length === 0 ? (
                <div className="p-4 text-center text-slate-500 text-xs">
                  No active maritime alerts
                </div>
              ) : (
                activeAlerts.map((alert) => (
                  <div key={alert.id} className="p-2.5 hover:bg-slate-50 transition-editorial">
                    <div className="flex items-start justify-between">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                          alert.priority === 'CRITICAL'
                            ? 'bg-red-100 text-red-800'
                            : alert.priority === 'HIGH'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-blue-100 text-blue-800'
                        }`}
                      >
                        {alert.priority}
                      </span>
                      <span className="text-[11px] text-slate-400 font-mono">
                        {new Date(alert.createdAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        })}
                      </span>
                    </div>
                    <p className="text-[12px] font-medium text-slate-900 mt-1 leading-[1.35]">
                      {alert.message}
                    </p>
                    <div className="flex items-center justify-between mt-2 pt-1 border-t border-slate-100">
                      <span className="text-[11px] text-slate-500 font-mono">
                        Vessels: {alert.shipIds?.join(', ') || 'Global'}
                      </span>
                      <div className="flex space-x-1">
                        <button
                          onClick={() => onAcknowledgeAlert(alert.id)}
                          className="h-7 px-2.5 text-xs font-medium rounded border border-slate-300 hover:bg-slate-100 text-slate-700"
                        >
                          Ack
                        </button>
                        {role === 'command' && (
                          <button
                            onClick={() => onResolveAlert(alert.id)}
                            className="h-7 px-2.5 text-xs font-medium rounded bg-slate-900 hover:bg-slate-800 text-white"
                          >
                            Resolve
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* 6. MUTE (Fixed 40px wide, 40px tall in both roles) */}
      <div className="w-10 h-10 shrink-0">
        <button
          onClick={onToggleMute}
          title={muted ? 'Unmute tactical alarms' : 'Mute tactical alarms'}
          aria-label={muted ? 'Unmute alarms' : 'Mute alarms'}
          className="w-10 h-10 rounded-lg border border-slate-700/80 text-slate-300 hover:text-white hover:bg-slate-800 transition-editorial cursor-pointer flex items-center justify-center shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 active:scale-[0.96]"
        >
          {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
        </button>
      </div>

      {/* 7. LATENCY (Fixed 96px wide, 40px tall in both roles) */}
      <div
        className="w-[96px] h-10 px-2.5 bg-[#18263a] rounded-lg border border-slate-700/80 text-[12px] font-mono tabular-nums text-slate-300 flex items-center justify-center space-x-1.5 shrink-0 select-none"
        title={`Real Round-Trip Latency: ${latencyMs ?? '--'} ms (target <500ms)`}
      >
        <span
          className={`w-2.5 h-2.5 rounded-full shrink-0 ${
            connected
              ? (latencyMs ?? 0) < 500
                ? 'bg-emerald-400 shadow-sm shadow-emerald-500/50'
                : 'bg-amber-400'
              : 'bg-red-500 animate-pulse'
          }`}
        />
        <span className="font-semibold text-slate-200 truncate">
          {connected ? (latencyMs !== null ? `${latencyMs}ms` : '<10ms') : 'OFF'}
        </span>
      </div>
    </header>
  );
};
