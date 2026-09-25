import React, { useState, useRef, useEffect } from 'react';
import { Ship, Port, Alert, Role } from '../types.ts';
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
  Menu,
  Activity,
} from 'lucide-react';
import { getCargoInfo } from '../utils/cargoTheme.ts';
import { Button } from './ui/button.tsx';
import { Input } from './ui/input.tsx';
import { Badge } from './ui/badge.tsx';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover.tsx';

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
  onFleetStatusOpenChange?: (open: boolean) => void;
  onOpenMobileFleet?: () => void;
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
  onFleetStatusOpenChange,
  onOpenMobileFleet,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isAlertMenuOpen, setIsAlertMenuOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Captain vessel popover state
  const [isCaptainPopoverOpen, setIsCaptainPopoverOpen] = useState(false);
  const [captainFilterQuery, setCaptainFilterQuery] = useState('');

  // Command vessel chip hover breakdown state
  const [isFleetHovered, setIsFleetHovered] = useState(false);

  // Responsive width tracking
  const [windowWidth, setWindowWidth] = useState<number>(() =>
    typeof window !== 'undefined' ? window.innerWidth : 1440
  );

  const searchRef = useRef<HTMLDivElement>(null);
  const fleetChipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const isMobile = windowWidth < 768;
  const isTablet = windowWidth >= 768 && windowWidth < 1200;
  const isDesktop = windowWidth >= 1200;

  const activeAlerts = alerts.filter((a) => a.state === 'active');
  const criticalCount = activeAlerts.filter((a) => a.priority === 'CRITICAL').length;

  const captainShip = fleet.find((s) => s.shipId === captainShipId) || fleet[0];

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

  // Close popovers on click outside search
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setIsSearchOpen(false);
      }
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setIsSearchOpen(false);
        setIsAlertMenuOpen(false);
        setIsCaptainPopoverOpen(false);
        setIsFleetHovered(false);
        setIsMobileMenuOpen(false);
        onFleetStatusOpenChange?.(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onFleetStatusOpenChange]);

  return (
    <header className="relative w-full h-14 bg-[#1a1a1a] text-[#faf8f5] border-b border-[#333333] z-50 select-none shadow-md shrink-0">
      {/* MOBILE TOP BAR (<768px, verified at 375px) - Non-wrapping icon/control row */}
      {isMobile ? (
        <div className="flex items-center justify-between h-full px-3 w-full">
          {/* Brand Wordmark in Space Grotesk */}
          <div className="flex items-center space-x-2 shrink-0">
            <div className="w-7 h-7 rounded-md bg-[#c65d33] flex items-center justify-center text-white shadow-xs">
              <Compass size={17} strokeWidth={2.5} />
            </div>
            <span className="font-display font-semibold text-sm tracking-tight text-[#faf8f5]">
              CRISIS OPS
            </span>
            <Badge variant="live" className="text-[9px] px-1 py-0 h-4">
              LIVE
            </Badge>
          </div>

          {/* Mobile Right Controls: Search, Alert, Menu */}
          <div className="flex items-center space-x-1.5 shrink-0">
            {/* Search Icon Popover */}
            <Popover open={isSearchOpen} onOpenChange={setIsSearchOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="w-8 h-8 rounded-md text-[#e0deda] hover:text-white hover:bg-[#2c2c2c]"
                  aria-label="Search fleet"
                >
                  <Search size={16} />
                </Button>
              </PopoverTrigger>
              <PopoverContent
                align="end"
                className="w-72 p-2 bg-[#faf8f5] text-[#1f1f1f] rounded-lg shadow-2xl border border-[#ded9d2] z-50"
              >
                <div className="relative flex items-center mb-2">
                  <Search size={14} className="absolute left-2.5 text-[#6b6660] pointer-events-none" />
                  <Input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search vessels or ports..."
                    autoFocus
                    className="h-8 pl-8 pr-7 bg-white border-[#ded9d2] text-xs text-[#1f1f1f]"
                  />
                  {searchQuery && (
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => setSearchQuery('')}
                      className="absolute right-1.5 text-[#6b6660] hover:text-[#1f1f1f]"
                    >
                      <X size={13} />
                    </Button>
                  )}
                </div>
                {filteredShips.length > 0 && (
                  <div className="max-h-48 overflow-y-auto divide-y divide-[#ded9d2]">
                    {filteredShips.map((s) => (
                      <button
                        key={s.shipId}
                        onClick={() => {
                          onSelectShip(s.shipId);
                          setIsSearchOpen(false);
                        }}
                        className="w-full px-2 py-1.5 hover:bg-[#faeee8] text-left flex items-center justify-between text-xs transition-colors cursor-pointer"
                      >
                        <span className="font-semibold text-[#1f1f1f] truncate">{s.name} ({s.shipId})</span>
                        <span className="text-[10px] text-[#6b6660] capitalize">{s.status}</span>
                      </button>
                    ))}
                  </div>
                )}
              </PopoverContent>
            </Popover>

            {/* Alert Bell with Badge */}
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => {
                onOpenAlertsTab();
                onOpenMobileFleet?.();
              }}
              className={`w-8 h-8 rounded-md relative text-[#e0deda] hover:text-white hover:bg-[#2c2c2c] ${
                activeAlerts.length > 0 && criticalCount > 0 ? 'text-[#dc2626]' : ''
              }`}
              title={`${activeAlerts.length} active alerts`}
            >
              <Bell size={16} />
              {activeAlerts.length > 0 && (
                <span
                  className={`absolute -top-0.5 -right-0.5 min-w-[15px] h-[15px] px-0.5 rounded-full text-[9px] font-bold flex items-center justify-center text-white ${
                    criticalCount > 0 ? 'bg-[#dc2626] animate-pulse' : 'bg-[#c65d33]'
                  }`}
                >
                  {activeAlerts.length}
                </span>
              )}
            </Button>

            {/* Role Chip Toggle */}
            <Button
              variant="outline"
              size="xs"
              onClick={() => onSwitchRole(role === 'command' ? 'captain' : 'command')}
              className="h-7 px-2 text-[11px] font-semibold border-[#383838] bg-[#242424] text-[#faf8f5] hover:bg-[#2c2c2c]"
            >
              {role === 'command' ? 'CMD' : 'CAPT'}
            </Button>

            {/* Mobile Drawer Trigger (Hamburger) */}
            <Popover open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="w-8 h-8 rounded-md text-[#e0deda] hover:text-white hover:bg-[#2c2c2c]"
                  aria-label="Navigation Menu"
                >
                  <Menu size={18} />
                </Button>
              </PopoverTrigger>
              <PopoverContent
                align="end"
                className="w-72 p-3 bg-[#faf8f5] text-[#1f1f1f] rounded-xl shadow-2xl border border-[#ded9d2] space-y-3 z-50"
              >
                <div className="flex items-center justify-between pb-2 border-b border-[#ded9d2]">
                  <span className="font-display font-semibold text-xs text-[#1f1f1f]">Fleet Controls</span>
                  <span className="text-[10px] font-mono text-[#6b6660]">{fleet.length} Vessels Active</span>
                </div>

                {/* Role Switcher in Mobile Drawer */}
                <div className="space-y-1">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-[#6b6660]">Role</span>
                  <div className="grid grid-cols-2 gap-1 p-1 bg-[#f2ede6] rounded-lg">
                    <Button
                      variant={role === 'command' ? 'primary' : 'ghost'}
                      size="sm"
                      onClick={() => {
                        onSwitchRole('command');
                        setIsMobileMenuOpen(false);
                      }}
                      className="h-7 text-xs font-semibold"
                    >
                      Command
                    </Button>
                    <Button
                      variant={role === 'captain' ? 'primary' : 'ghost'}
                      size="sm"
                      onClick={() => {
                        onSwitchRole('captain', captainShipId);
                        setIsMobileMenuOpen(false);
                      }}
                      className="h-7 text-xs font-semibold"
                    >
                      Captain
                    </Button>
                  </div>
                </div>

                {/* Fleet Status Summary */}
                <div className="space-y-1">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-[#6b6660]">Fleet Status</span>
                  <div className="grid grid-cols-3 gap-1.5 text-center font-mono">
                    <div className="bg-[#eef3ed] border border-[#c4d6c0] rounded p-1.5">
                      <div className="text-[#3d5238] font-bold text-sm">{normalCount}</div>
                      <div className="text-[9px] text-[#4a6344] font-sans">Normal</div>
                    </div>
                    <div className="bg-[#faeee8] border border-[#f5cfbd] rounded p-1.5">
                      <div className="text-[#c65d33] font-bold text-sm">{reroutingCount}</div>
                      <div className="text-[9px] text-[#9a3412] font-sans">Reroute</div>
                    </div>
                    <div className="bg-[#fef2f2] border border-[#fecaca] rounded p-1.5">
                      <div className="text-[#dc2626] font-bold text-sm">{distressedCount}</div>
                      <div className="text-[9px] text-[#991b1b] font-sans">Distress</div>
                    </div>
                  </div>
                </div>

                {/* Controls: Mute & Latency */}
                <div className="flex items-center justify-between pt-2 border-t border-[#ded9d2]">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onToggleMute}
                    className="h-7 px-2.5 text-xs space-x-1.5 border-[#ded9d2]"
                  >
                    {muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
                    <span>{muted ? 'Unmute' : 'Mute'}</span>
                  </Button>
                  <div className="text-[11px] font-mono tabular-nums text-[#6b6660] flex items-center space-x-1.5">
                    <span className="w-2 h-2 rounded-full bg-[#7a9471]" />
                    <span>{connected ? `${latencyMs ?? '<10'}ms` : 'OFFLINE'}</span>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>
      ) : (
        /* TABLET & DESKTOP TOP BAR (>=768px, verified at 768px & 1440px) */
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: isTablet
              ? '210px minmax(140px, 1fr) 200px 210px 38px 38px 84px'
              : '240px minmax(180px, 1fr) 216px 260px 40px 40px 96px',
            columnGap: isTablet ? '8px' : '12px',
            height: '100%',
            padding: isTablet ? '0 10px' : '0 16px',
          }}
          className="items-center w-full"
        >
          {/* 1. BRAND ZONE: Compass Icon + Space Grotesk Title */}
          <div className="flex items-center space-x-2.5 h-10 overflow-hidden min-w-0">
            <div className="w-8 h-8 rounded-lg bg-[#c65d33] flex items-center justify-center text-white shadow-xs shrink-0">
              <Compass size={19} strokeWidth={2.5} />
            </div>
            <div className="flex flex-col justify-center min-w-0">
              <div className="flex items-center space-x-1.5 leading-none">
                <span className="font-display font-semibold tracking-tight text-xs sm:text-sm text-[#faf8f5] whitespace-nowrap">
                  MARITIME TAC-OPS
                </span>
                <Badge variant="live" className="text-[9px] px-1 py-0 h-4">
                  LIVE
                </Badge>
              </div>
              {isDesktop && (
                <span className="text-[10px] text-[#9e9992] tracking-tight whitespace-nowrap overflow-hidden text-ellipsis mt-0.5">
                  Strait of Hormuz Fleet Operations
                </span>
              )}
            </div>
          </div>

          {/* 2. SEARCH: Input with autocomplete dropdown */}
          <div ref={searchRef} className="relative h-9 min-w-0 flex items-center">
            <Search size={15} className="absolute left-3 text-[#9e9992] pointer-events-none shrink-0" />
            <Input
              type="text"
              placeholder="Search vessels or ports..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setIsSearchOpen(true);
              }}
              onFocus={() => setIsSearchOpen(true)}
              className="h-9 pl-9 pr-7 bg-[#242424] hover:bg-[#2c2c2c] focus:bg-[#2c2c2c] border-[#383838] focus-visible:border-[#c65d33] focus-visible:ring-[#c65d33] rounded-md text-xs text-[#faf8f5] placeholder:text-[#8c857b] truncate min-w-0 w-full"
            />
            {searchQuery && (
              <Button
                variant="ghost"
                size="icon-xs"
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setIsSearchOpen(false);
                }}
                className="absolute right-1.5 text-[#8c857b] hover:text-[#faf8f5]"
                aria-label="Clear search"
              >
                <X size={14} />
              </Button>
            )}

            {/* Search Dropdown Results */}
            {isSearchOpen && (filteredShips.length > 0 || filteredPorts.length > 0) && (
              <div className="absolute top-11 inset-x-0 bg-[#faf8f5] text-[#1f1f1f] rounded-lg shadow-2xl border border-[#ded9d2] py-1.5 z-50 max-h-80 overflow-y-auto">
                {filteredShips.length > 0 && (
                  <div>
                    <div className="px-3 py-1 section-label text-[#6b6660] bg-[#f2ede6]">
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
                          className="w-full px-3 py-2 hover:bg-[#faeee8] text-left flex items-center justify-between text-xs transition-colors border-b border-[#ded9d2] last:border-0 cursor-pointer"
                        >
                          <div className="flex items-center space-x-2 truncate">
                            <span
                              className="w-2.5 h-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: cargo.color }}
                            />
                            <span className="font-semibold text-[#1f1f1f]">{s.name}</span>
                            <span className="text-[10px] text-[#6b6660] font-mono">({s.shipId})</span>
                            <span className="text-[10px] text-[#8c857b]">· {cargo.label}</span>
                          </div>
                          <Badge
                            variant={
                              s.status === 'distressed'
                                ? 'distressed'
                                : s.status === 'rerouting'
                                ? 'rerouting'
                                : 'normal'
                            }
                            className="text-[9px] px-1.5 py-0.2"
                          >
                            {s.status}
                          </Badge>
                        </button>
                      );
                    })}
                  </div>
                )}
                {filteredPorts.length > 0 && (
                  <div>
                    <div className="px-3 py-1 section-label text-[#6b6660] bg-[#f2ede6] border-t border-[#ded9d2]">
                      Ports ({filteredPorts.length})
                    </div>
                    {filteredPorts.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => setIsSearchOpen(false)}
                        className="w-full px-3 py-2 hover:bg-[#f2ede6] text-left flex items-center justify-between text-xs transition-colors cursor-pointer"
                      >
                        <span className="font-medium text-[#1f1f1f]">{p.name}</span>
                        <span className="text-[10px] text-[#6b6660] font-mono">{p.id}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 3. ROLE TOGGLE: Command vs Captain with terracotta active segment */}
          <div
            role="tablist"
            aria-label="Operating Role"
            className="h-9 p-0.5 flex items-center bg-[#242424] border border-[#383838] rounded-md shrink-0 select-none"
          >
            <Button
              role="tab"
              aria-selected={role === 'command'}
              onClick={() => onSwitchRole('command')}
              variant="ghost"
              className={`flex-1 h-full rounded text-xs font-semibold space-x-1 p-0 transition-colors ${
                role === 'command'
                  ? 'bg-[#c65d33] text-white shadow-xs'
                  : 'text-[#e0deda] hover:text-white hover:bg-white/5'
              }`}
            >
              <Radio size={14} />
              <span>Command</span>
            </Button>
            <Button
              role="tab"
              aria-selected={role === 'captain'}
              onClick={() => onSwitchRole('captain', captainShipId)}
              variant="ghost"
              className={`flex-1 h-full rounded text-xs font-semibold space-x-1 p-0 transition-colors ${
                role === 'captain'
                  ? 'bg-[#c65d33] text-white shadow-xs'
                  : 'text-[#e0deda] hover:text-white hover:bg-white/5'
              }`}
            >
              <Navigation size={14} />
              <span>Captain</span>
            </Button>
          </div>

          {/* 4. VESSEL / FLEET SLOT: Light theme popover breakdown */}
          <div className="h-9 relative shrink-0">
            {role === 'command' ? (
              <div
                ref={fleetChipRef}
                onMouseEnter={() => {
                  setIsFleetHovered(true);
                  onFleetStatusOpenChange?.(true);
                }}
                onMouseLeave={() => {
                  setIsFleetHovered(false);
                  onFleetStatusOpenChange?.(false);
                }}
                className="w-full h-full relative"
              >
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => onToggleLeftRail?.()}
                  title="Click to toggle left fleet panel"
                  className="w-full h-full rounded-md px-3 justify-between text-[#faf8f5] text-xs font-semibold bg-[#242424] hover:bg-[#2c2c2c] border-[#383838] shadow-xs"
                >
                  <div className="flex items-center space-x-2 truncate">
                    <ShipIcon size={15} className="text-[#c65d33] shrink-0" />
                        <span className="truncate">Fleet · {fleet.length} vessels</span>
                  </div>
                  <span className="text-[10px] font-mono text-[#9e9992] shrink-0">
                    {distressedCount > 0 ? `${distressedCount} alert` : 'active'}
                  </span>
                </Button>

                {/* Fleet Operational Status Popover: Clean light theme (#faf8f5) */}
                {isFleetHovered && (
                  <div className="absolute top-11 left-0 w-72 bg-[#faf8f5] text-[#1f1f1f] border border-[#ded9d2] rounded-lg p-3 shadow-2xl z-50 text-xs pointer-events-none">
                    <div className="flex items-center justify-between font-semibold pb-2 border-b border-[#ded9d2] text-xs text-[#1f1f1f]">
                      <span className="flex items-center space-x-1.5 font-display">
                        <ShipIcon size={14} className="text-[#c65d33]" />
                        <span>Fleet Operational Status</span>
                      </span>
                      <Badge variant="outline" className="font-mono text-[#403c37] bg-white border-[#ded9d2] text-[10px]">
                        {fleet.length} Vessels
                      </Badge>
                    </div>
                    <div className="grid grid-cols-3 gap-2 pt-2.5 text-center font-mono">
                      <div className="bg-[#eef3ed] border border-[#c4d6c0] rounded-md p-2">
                        <div className="text-[#3d5238] font-bold text-base leading-tight">
                          {normalCount}
                        </div>
                        <div className="text-[10px] text-[#4a6344] font-sans font-medium mt-0.5">Normal</div>
                      </div>
                      <div className="bg-[#faeee8] border border-[#f5cfbd] rounded-md p-2">
                        <div className="text-[#c65d33] font-bold text-base leading-tight">
                          {reroutingCount}
                        </div>
                        <div className="text-[10px] text-[#9a3412] font-sans font-medium mt-0.5">Rerouting</div>
                      </div>
                      <div className="bg-[#fef2f2] border border-[#fecaca] rounded-md p-2">
                        <div className="text-[#dc2626] font-bold text-base leading-tight">
                          {distressedCount}
                        </div>
                        <div className="text-[10px] text-[#991b1b] font-sans font-medium mt-0.5">Distressed</div>
                      </div>
                    </div>
                    <div className="text-[10px] text-[#6b6660] text-center pt-2 mt-2 border-t border-[#ded9d2] font-sans">
                      Click chip to expand / collapse fleet panel
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* Captain Mode Vessel Picker */
              <Popover open={isCaptainPopoverOpen} onOpenChange={setIsCaptainPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="secondary"
                    className="w-full h-full rounded-md px-3 justify-between text-[#faf8f5] text-xs font-semibold bg-[#242424] hover:bg-[#2c2c2c] border-[#383838] shadow-xs"
                  >
                    <div className="flex items-center space-x-2 truncate">
                      <Navigation size={14} className="text-[#c65d33] shrink-0" />
                      <span className="truncate">{captainShip?.name || 'MV-1 Aurora'}</span>
                      <span className="text-[10px] font-mono text-[#9e9992]">({captainShipId})</span>
                    </div>
                    <ChevronDown size={14} className="text-[#8c857b] shrink-0" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  align="start"
                  className="w-72 p-2 bg-[#faf8f5] text-[#1f1f1f] rounded-lg shadow-2xl border border-[#ded9d2] z-50"
                >
                  <div className="pb-1.5 mb-1.5 border-b border-[#ded9d2]">
                    <span className="section-label text-[#1f1f1f]">Assigned Command Vessel</span>
                  </div>
                  <div className="max-h-56 overflow-y-auto divide-y divide-[#ded9d2]">
                    {captainFilteredFleet.map((s) => {
                      const isCurrent = s.shipId === captainShipId;
                      return (
                        <button
                          key={s.shipId}
                          onClick={() => {
                            onSwitchRole('captain', s.shipId);
                            setIsCaptainPopoverOpen(false);
                          }}
                          className={`w-full px-2.5 py-1.5 text-left flex items-center justify-between text-xs transition-colors rounded ${
                            isCurrent ? 'bg-[#faeee8] font-bold text-[#c65d33]' : 'hover:bg-[#f2ede6]'
                          }`}
                        >
                          <span className="truncate">{s.name} ({s.shipId})</span>
                          {isCurrent && <Check size={14} className="text-[#c65d33]" />}
                        </button>
                      );
                    })}
                  </div>
                </PopoverContent>
              </Popover>
            )}
          </div>

          {/* 5. ALERT BELL: Popover with compact Ack / Resolve buttons */}
          <div className="h-9 relative shrink-0 flex items-center justify-center">
            <Popover open={isAlertMenuOpen} onOpenChange={setIsAlertMenuOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="secondary"
                  size="icon"
                  className={`w-9 h-9 rounded-md relative ${
                    activeAlerts.length > 0
                      ? criticalCount > 0
                        ? 'bg-red-950/60 border-red-500 text-red-400 hover:bg-red-900/60'
                        : 'bg-[#faeee8]/20 border-[#c65d33] text-[#c65d33] hover:bg-[#faeee8]/30'
                      : 'border-[#383838] bg-[#242424] text-[#e0deda] hover:text-white hover:bg-[#2c2c2c]'
                  }`}
                  title={`${activeAlerts.length} active alerts`}
                  aria-label={`${activeAlerts.length} active alerts`}
                >
                  <Bell size={17} />
                  {activeAlerts.length > 0 && (
                    <span
                      className={`absolute -top-1 -right-1 min-w-[17px] h-[17px] px-1 rounded-full text-[9px] font-bold flex items-center justify-center text-white ${
                        criticalCount > 0 ? 'bg-[#dc2626] animate-pulse' : 'bg-[#c65d33]'
                      }`}
                    >
                      {activeAlerts.length}
                    </span>
                  )}
                </Button>
              </PopoverTrigger>

              <PopoverContent
                align="end"
                className="w-80 md:w-96 p-0 bg-[#faf8f5] text-[#1f1f1f] rounded-lg shadow-2xl border border-[#ded9d2] z-50 overflow-hidden"
              >
                <div className="px-3.5 py-2.5 bg-[#f2ede6] border-b border-[#ded9d2] flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="font-display font-semibold text-xs text-[#1f1f1f]">Maritime Tactical Alerts</span>
                    {criticalCount > 0 && (
                      <Badge variant="critical" className="text-[10px]">
                        {criticalCount} Critical
                      </Badge>
                    )}
                  </div>
                  <Button
                    variant="link"
                    size="xs"
                    onClick={() => {
                      onOpenAlertsTab();
                      setIsAlertMenuOpen(false);
                    }}
                    className="text-[11px] text-[#c65d33] hover:text-[#b04f29] p-0 h-auto font-medium"
                  >
                    View in Panel
                  </Button>
                </div>

                <div className="max-h-72 overflow-y-auto divide-y divide-[#ded9d2]">
                  {activeAlerts.length === 0 ? (
                    <div className="p-4 text-center text-[#6b6660] text-xs">
                      No active maritime alerts
                    </div>
                  ) : (
                    activeAlerts.map((alert) => (
                      <div key={alert.id} className="p-3 hover:bg-[#f2ede6] transition-colors">
                        <div className="flex items-start justify-between">
                          <Badge
                            variant={
                              alert.priority === 'CRITICAL'
                                ? 'critical'
                                : alert.priority === 'HIGH'
                                ? 'warning'
                                : 'secondary'
                            }
                            className="text-[10px] font-bold uppercase"
                          >
                            {alert.priority}
                          </Badge>
                          <span className="text-[10px] text-[#6b6660] font-mono">
                            {new Date(alert.createdAt).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                              second: '2-digit',
                            })}
                          </span>
                        </div>
                        <p className="text-xs font-semibold text-[#1f1f1f] mt-1 leading-snug">
                          {alert.message}
                        </p>
                        <div className="flex items-center justify-between mt-2 pt-1 border-t border-[#ded9d2]">
                          <span className="text-[10px] text-[#6b6660] font-mono">
                            Ship: {alert.shipIds?.join(', ') || 'Global'}
                          </span>
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
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </PopoverContent>
            </Popover>
          </div>

          {/* 6. MUTE ALARM BUTTON */}
          <div className="h-9 shrink-0 flex items-center justify-center">
            <Button
              variant="secondary"
              size="icon"
              onClick={onToggleMute}
              title={muted ? 'Unmute tactical alarms' : 'Mute tactical alarms'}
              aria-label={muted ? 'Unmute alarms' : 'Mute alarms'}
              className="w-9 h-9 rounded-md border-[#383838] bg-[#242424] text-[#e0deda] hover:text-white hover:bg-[#2c2c2c]"
            >
              {muted ? <VolumeX size={17} /> : <Volume2 size={17} />}
            </Button>
          </div>

          {/* 7. REAL ROUND-TRIP LATENCY (Tabular Mono) */}
          <div
            className="h-9 px-2 bg-[#242424] rounded-md border border-[#383838] text-[11px] font-mono tabular-nums text-[#e0deda] flex items-center justify-center space-x-1.5 shrink-0 select-none"
            title={`Real Round-Trip WebSocket Latency: ${latencyMs ?? '--'} ms`}
          >
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${
                connected
                  ? (latencyMs ?? 0) < 500
                    ? 'bg-[#7a9471]'
                    : 'bg-[#c65d33]'
                  : 'bg-[#dc2626] animate-pulse'
              }`}
            />
            <span className="font-semibold truncate">
              {connected ? (latencyMs !== null ? `${latencyMs}ms` : '<10ms') : 'OFF'}
            </span>
          </div>
        </div>
      )}
    </header>
  );
};
