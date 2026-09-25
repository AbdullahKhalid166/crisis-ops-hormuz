import React, { useState } from 'react';
import { Ship, Role } from '../types.ts';
import {
  ChevronLeft,
  ChevronRight,
  Search,
  AlertTriangle,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import { getCargoInfo } from '../utils/cargoTheme.ts';
import { Button } from './ui/button.tsx';
import { Input } from './ui/input.tsx';
import { Badge } from './ui/badge.tsx';

interface LeftRailProps {
  fleet: Ship[];
  selectedShipId: string | null;
  onSelectShip: (shipId: string) => void;
  role: Role;
  captainShipId: string;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  isSlideOver?: boolean;
  onCloseSlideOver?: () => void;
}

export const LeftRail: React.FC<LeftRailProps> = ({
  fleet,
  selectedShipId,
  onSelectShip,
  role,
  captainShipId,
  isCollapsed: controlledCollapsed,
  onToggleCollapse: controlledToggle,
  isSlideOver,
  onCloseSlideOver,
}) => {
  const [internalCollapsed, setInternalCollapsed] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth < 1400;
    }
    return false;
  });

  const isCollapsed = controlledCollapsed !== undefined ? controlledCollapsed : internalCollapsed;
  const handleToggle = () => {
    if (controlledToggle) {
      controlledToggle();
    } else {
      setInternalCollapsed((prev) => !prev);
    }
  };

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'distressed' | 'alert' | 'tankers' | 'containers'>('all');
  const [hoveredDotShipId, setHoveredDotShipId] = useState<string | null>(null);

  // Sort fleet numerically MV-1 to MV-15
  const sortedFleet = [...fleet].sort((a, b) => {
    const numA = parseInt(a.shipId.replace(/\D/g, ''), 10) || 0;
    const numB = parseInt(b.shipId.replace(/\D/g, ''), 10) || 0;
    return numA - numB;
  });

  // Filtered fleet for expanded rail mode
  const filteredFleet = sortedFleet.filter((ship) => {
    const matchesSearch =
      ship.name.toLowerCase().includes(search.toLowerCase()) ||
      ship.shipId.toLowerCase().includes(search.toLowerCase()) ||
      ship.cargo.toLowerCase().includes(search.toLowerCase()) ||
      (ship.destinationPortName &&
        ship.destinationPortName.toLowerCase().includes(search.toLowerCase()));

    if (!matchesSearch) return false;

    if (filter === 'distressed') return ship.status === 'distressed';
    if (filter === 'alert')
      return ['distressed', 'stranded', 'insufficient_fuel', 'no_fuel', 'rerouting'].includes(
        ship.status
      );
    if (filter === 'tankers')
      return ship.cargo.toLowerCase().includes('oil') || ship.cargo.toLowerCase().includes('lng');
    if (filter === 'containers') return ship.cargo.toLowerCase().includes('container');

    return true;
  });

  const distressedCount = sortedFleet.filter((s) => s.status === 'distressed').length;

  return (
    <aside
      style={{
        width: isCollapsed ? 'var(--left-rail-collapsed-width, 56px)' : 'var(--left-rail-width, 310px)',
      }}
      className="relative h-full bg-[#faf8f5] border-r border-[#ded9d2] flex flex-col transition-all duration-150 shadow-sm z-30 select-none shrink-0"
    >
      {/* Edge Collapse / Expand Toggle Button (Hidden in slide-over mode) */}
      {!isSlideOver && (
        <button
          onClick={handleToggle}
          className="absolute -right-3 top-3.5 z-40 w-6 h-6 bg-[#faf8f5] border border-[#ded9d2] rounded-full text-[#6b6660] hover:text-[#1f1f1f] hover:border-[#1f1f1f] shadow-sm flex items-center justify-center cursor-pointer transition-colors"
          title={isCollapsed ? 'Expand fleet panel' : 'Collapse fleet panel'}
        >
          {isCollapsed ? <ChevronRight size={13} /> : <ChevronLeft size={13} />}
        </button>
      )}

      {isCollapsed ? (
        /* Collapsed Minimal Icon Rail (56px) */
        <div className="flex flex-col items-center py-3 h-full overflow-hidden w-full">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={handleToggle}
            className="text-[#6b6660] hover:text-[#1f1f1f] hover:bg-[#f2ede6] mb-3"
            title="Expand fleet rail"
          >
            <PanelLeftOpen size={16} />
          </Button>

          {/* Vertical indicator dot list */}
          <div className="flex-1 overflow-y-auto w-full flex flex-col items-center space-y-2 py-1 scrollbar-none">
            {sortedFleet.map((s) => {
              const cargo = getCargoInfo(s.cargo);
              const isSelected = selectedShipId === s.shipId;
              const isCaptainMode = role === 'captain';
              const isAssignedCaptainShip = isCaptainMode && s.shipId === captainShipId;
              const isDistressed = s.status === 'distressed';
              const isHovered = hoveredDotShipId === s.shipId;

              return (
                <div
                  key={s.shipId}
                  className="relative group flex items-center justify-center"
                  onMouseEnter={() => setHoveredDotShipId(s.shipId)}
                  onMouseLeave={() => setHoveredDotShipId(null)}
                >
                  <button
                    onClick={() => onSelectShip(s.shipId)}
                    className={`relative w-8 h-8 rounded-md flex items-center justify-center transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-[#faeee8] ring-2 ring-[#c65d33]'
                        : isAssignedCaptainShip
                        ? 'bg-[#faeee8] ring-1 ring-[#c65d33]'
                        : isDistressed
                        ? 'bg-red-50 ring-1 ring-red-500'
                        : 'hover:bg-[#f2ede6]'
                    }`}
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: isDistressed ? '#dc2626' : cargo.color }}
                    />
                  </button>

                  {/* Tooltip on hover */}
                  {isHovered && (
                    <div className="absolute left-full ml-2 z-50 bg-[#1a1a1a] text-[#faf8f5] text-xs rounded-md py-1.5 px-2.5 pointer-events-none shadow-xl border border-[#333333] whitespace-nowrap min-w-[130px]">
                      <div className="flex items-center space-x-1.5 mb-0.5">
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: isDistressed ? '#dc2626' : cargo.color }}
                        />
                        <span className="font-display font-semibold truncate">{s.name}</span>
                        <span className="text-[10px] text-[#8c857b] font-mono">({s.shipId})</span>
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-[#ded9d2]">
                        <span className="capitalize">{s.status.replace('_', ' ')}</span>
                        <span className="font-mono text-[#c65d33]">{s.speed.toFixed(1)} kn</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* Full Expanded Panel Mode (310px) */
        <div className="flex flex-col h-full overflow-hidden w-full">
          {/* Header & Filter Bar */}
          <div className="p-3 border-b border-[#ded9d2] bg-[#f2ede6] space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <span className="section-label text-[#1f1f1f]">
                  {role === 'captain' ? 'Fleet Traffic' : 'Fleet Manifest'}
                </span>
                <span className="text-[11px] font-mono px-1.5 py-0.2 rounded bg-[#ded9d2] text-[#1f1f1f] font-semibold tabular-nums">
                  {filteredFleet.length} / {sortedFleet.length}
                </span>
              </div>
              <div className="flex items-center space-x-1.5">
                {distressedCount > 0 && (
                  <Badge variant="distressed" className="text-[9px] px-1.5 py-0.5 flex items-center space-x-1">
                    <AlertTriangle size={11} className="mr-0.5" />
                    <span>{distressedCount} ALERT</span>
                  </Badge>
                )}
                {isSlideOver ? (
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={onCloseSlideOver}
                    className="text-[#6b6660] hover:text-[#1f1f1f]"
                  >
                    <PanelLeftClose size={15} />
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={handleToggle}
                    className="text-[#6b6660] hover:text-[#1f1f1f]"
                    title="Collapse fleet panel"
                  >
                    <PanelLeftClose size={15} />
                  </Button>
                )}
              </div>
            </div>

            {/* Search Input using shadcn Input */}
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-2.5 text-[#6b6660]" />
              <Input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter name, cargo, port..."
                className="h-8 pl-8 pr-3 text-xs bg-white border-[#ded9d2] text-[#1f1f1f] placeholder:text-[#8c857b]"
              />
            </div>

            {/* Quick Filter Tags with Terracotta active state */}
            <div className="flex items-center space-x-1 overflow-x-auto pb-0.5 pt-0.5 scrollbar-none text-[11px]">
              {(
                [
                  { key: 'all', label: 'All' },
                  { key: 'distressed', label: 'Distress' },
                  { key: 'alert', label: 'Attention' },
                  { key: 'tankers', label: 'Tankers' },
                  { key: 'containers', label: 'Cargo' },
                ] as const
              ).map((tab) => (
                <Button
                  key={tab.key}
                  variant={filter === tab.key ? 'default' : 'outline'}
                  size="xs"
                  onClick={() => setFilter(tab.key)}
                  className={`h-6 px-2 text-[11px] whitespace-nowrap transition-colors ${
                    filter === tab.key
                      ? 'bg-[#c65d33] text-white hover:bg-[#b04f29] border-[#c65d33]'
                      : 'bg-white text-[#403c37] border-[#ded9d2] hover:bg-[#f2ede6]'
                  }`}
                >
                  {tab.label}
                </Button>
              ))}
            </div>
          </div>

          {/* Vessel List with Intentional Asymmetry: subtle 2px left-border accent on selected ship */}
          <div className="flex-1 overflow-y-auto divide-y divide-[#ded9d2]">
            {filteredFleet.length === 0 ? (
              <div className="p-6 text-center text-xs text-[#6b6660]">
                No vessels match filter criteria
              </div>
            ) : (
              filteredFleet.map((ship) => {
                const cargo = getCargoInfo(ship.cargo);
                const isSelected = selectedShipId === ship.shipId;
                const isCaptainMode = role === 'captain';
                const isCaptainShip = isCaptainMode && ship.shipId === captainShipId;
                const isOtherCaptainShip = isCaptainMode && ship.shipId !== captainShipId;
                const isDistressed = ship.status === 'distressed';
                const isRerouting = ship.status === 'rerouting';
                const isNominal = !isDistressed && !isRerouting;

                let rowClass = 'p-2.5 transition-colors cursor-pointer flex flex-col justify-between ';
                if (isCaptainMode) {
                  if (isCaptainShip) {
                    rowClass += 'bg-[#faeee8] border-l-2 border-l-[#c65d33] font-medium';
                  } else if (isSelected) {
                    rowClass += 'bg-[#f2ede6] border-l-2 border-l-[#6b6660]';
                  } else {
                    rowClass += 'opacity-65 hover:opacity-100 hover:bg-[#f2ede6] border-l-2 border-l-transparent';
                  }
                } else {
                  if (isSelected) {
                    rowClass += 'bg-[#faeee8] border-l-2 border-l-[#c65d33]';
                  } else if (isDistressed) {
                    rowClass += 'bg-red-50/60 hover:bg-red-50/80 border-l-2 border-l-[#dc2626]';
                  } else {
                    rowClass += 'hover:bg-[#f2ede6] border-l-2 border-l-transparent';
                  }
                }

                return (
                  <div
                    key={ship.shipId}
                    onClick={() => onSelectShip(ship.shipId)}
                    title={`${ship.name} (${ship.shipId}) · Status: ${ship.status.replace('_', ' ')}`}
                    className={rowClass}
                  >
                    {/* Row 1: Cargo dot, Name in Space Grotesk, ID, Speed */}
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center space-x-2 min-w-0">
                        {/* Colored Cargo Dot */}
                        <div className="relative shrink-0">
                          <span
                            className="w-2.5 h-2.5 rounded-full inline-block"
                            style={{ backgroundColor: isDistressed ? '#dc2626' : cargo.color }}
                          />
                          {isDistressed && (
                            <span className="absolute -inset-1 rounded-full border-2 border-red-500 distressed-ring-pulse pointer-events-none" />
                          )}
                        </div>

                        <span className="font-display text-xs font-semibold text-[#1f1f1f] truncate">
                          {ship.name}
                        </span>

                        <span className="text-[10px] text-[#6b6660] font-mono shrink-0">
                          {ship.shipId}
                        </span>

                        {isCaptainShip && (
                          <Badge variant="assigned" className="text-[9px] px-1 py-0">
                            Assigned
                          </Badge>
                        )}

                        {isOtherCaptainShip && (
                          <Badge variant="traffic" className="text-[9px] px-1 py-0">
                            Traffic
                          </Badge>
                        )}
                      </div>

                      {/* Speed badge */}
                      <span className="text-xs font-semibold font-mono text-[#1f1f1f] tabular-nums shrink-0">
                        {ship.speed.toFixed(1)} <span className="text-[10px] text-[#6b6660] font-normal">kn</span>
                      </span>
                    </div>

                    {/* Row 2: Cargo Pill, Destination, Status Badge */}
                    <div className="flex items-center justify-between text-[11px] text-[#6b6660] mt-0.5 mb-1.5">
                      <div className="flex items-center space-x-1.5 truncate pr-2">
                        <span
                          className="text-[10px] px-1.5 py-0.2 rounded font-medium shrink-0"
                          style={{ backgroundColor: cargo.bgLight, color: cargo.textColor }}
                        >
                          {cargo.label}
                        </span>
                        <span className="truncate">
                          → {ship.destinationPortName || ship.destination}
                        </span>
                      </div>

                      <Badge
                        variant={
                          isDistressed
                            ? 'distressed'
                            : isRerouting
                            ? 'rerouting'
                            : 'normal'
                        }
                        className="text-[9px] px-1.5 py-0.2 shrink-0 font-sans"
                      >
                        {isNominal ? 'Normal' : ship.status.replace('_', ' ')}
                      </Badge>
                    </div>

                    {/* Row 3: Fuel Mini Indicator */}
                    <div className="flex items-center space-x-2 text-[10px] text-[#8c857b] font-mono">
                      <span>Fuel</span>
                      <div className="flex-1 h-1 bg-[#ded9d2] rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            ship.fuel < 1000
                              ? 'bg-[#dc2626]'
                              : ship.fuel < 2500
                              ? 'bg-[#c65d33]'
                              : 'bg-[#7a9471]'
                          }`}
                          style={{
                            width: `${Math.min(100, Math.max(0, (ship.fuel / 8500) * 100))}%`,
                          }}
                        />
                      </div>
                      <span className="tabular-nums">{Math.round(ship.fuel)}T</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </aside>
  );
};
