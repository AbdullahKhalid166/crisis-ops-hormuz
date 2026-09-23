import React, { useState } from 'react';
import { Ship, Role } from '../types.ts';
import {
  ChevronLeft,
  ChevronRight,
  Search,
  Ship as ShipIcon,
  AlertTriangle,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import { getCargoInfo } from '../utils/cargoTheme.ts';

interface LeftRailProps {
  fleet: Ship[];
  selectedShipId: string | null;
  onSelectShip: (shipId: string) => void;
  role: Role;
  captainShipId: string;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export const LeftRail: React.FC<LeftRailProps> = ({
  fleet,
  selectedShipId,
  onSelectShip,
  role,
  captainShipId,
  isCollapsed: controlledCollapsed,
  onToggleCollapse: controlledToggle,
}) => {
  // Support both controlled and uncontrolled mode
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
        width: isCollapsed ? 'var(--left-rail-collapsed-width, 56px)' : 'var(--left-rail-width, 300px)',
      }}
      className="relative h-full bg-white border-r border-[#e3e7ec] flex flex-col transition-editorial shadow-xs z-30 select-none shrink-0"
    >
      {/* Edge Collapse / Expand Toggle Button */}
      <button
        onClick={handleToggle}
        className="absolute -right-3.5 top-3.5 z-40 w-7 h-7 bg-white border border-[#e3e7ec] rounded-full text-slate-600 hover:text-slate-900 hover:border-slate-400 shadow-md flex items-center justify-center cursor-pointer transition-editorial"
        title={isCollapsed ? 'Expand fleet rail' : 'Collapse fleet rail'}
      >
        {isCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
      </button>

      {isCollapsed ? (
        /* Slim Icon Rail Mode (56px) */
        <div className="flex flex-col items-center py-3.5 space-y-3 h-full overflow-y-auto w-full">
          {/* Rail expand toggle button at top of icon rail */}
          <button
            onClick={handleToggle}
            className="w-8 h-8 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center transition-editorial cursor-pointer"
            title="Expand fleet rail"
          >
            <PanelLeftOpen size={16} />
          </button>

          <div className="w-full px-2">
            <div className="h-[1px] bg-slate-200 w-full" />
          </div>

          {/* Quick Ship Dots: In Captain mode, show ALL ships as dots, assigned ship highlighted with amber ring, others 50% opacity */}
          <div className="flex flex-col space-y-2 items-center flex-1 w-full px-1">
            {sortedFleet.map((s) => {
              const cargo = getCargoInfo(s.cargo);
              const isSelected = selectedShipId === s.shipId;
              const isCaptainMode = role === 'captain';
              const isAssignedCaptainShip = isCaptainMode && s.shipId === captainShipId;
              const isOtherShipInCaptainMode = isCaptainMode && s.shipId !== captainShipId;
              const isDistressed = s.status === 'distressed';
              const isRerouting = s.status === 'rerouting';
              const isHovered = hoveredDotShipId === s.shipId;

              // Style dot button
              let dotButtonClass = 'relative w-8 h-8 rounded-md flex items-center justify-center transition-editorial cursor-pointer ';
              if (isCaptainMode) {
                if (isAssignedCaptainShip) {
                  // Keep assigned ship highlighted with an amber ring
                  dotButtonClass += 'bg-amber-500/15 ring-2 ring-amber-500 opacity-100 shadow-sm z-10';
                } else {
                  // Dim the others to 50% opacity
                  if (isSelected) {
                    dotButtonClass += 'opacity-80 ring-1 ring-slate-400 bg-slate-100 hover:opacity-100';
                  } else {
                    dotButtonClass += 'opacity-50 hover:opacity-100 hover:bg-slate-100';
                  }
                }
              } else {
                if (isSelected) {
                  dotButtonClass += 'bg-amber-100 ring-2 ring-amber-500';
                } else {
                  dotButtonClass += 'hover:bg-slate-100';
                }
              }

              return (
                <div key={s.shipId} className="relative flex items-center justify-center">
                  <button
                    onClick={() => onSelectShip(s.shipId)}
                    onMouseEnter={() => setHoveredDotShipId(s.shipId)}
                    onMouseLeave={() => setHoveredDotShipId(null)}
                    title={`${s.name} (${s.shipId}) · Status: ${s.status.replace('_', ' ')}`}
                    className={dotButtonClass}
                    aria-label={`Select vessel ${s.name}`}
                  >
                    <span
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: isDistressed ? '#dc2626' : cargo.color }}
                    />
                    {isDistressed && (
                      <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-600 rounded-full animate-ping" />
                    )}
                    {isRerouting && (
                      <span className="absolute -inset-0.5 rounded-full border border-dashed border-amber-500 pointer-events-none" />
                    )}
                  </button>

                  {/* Rich Tooltip on hover with ship name + status */}
                  {isHovered && (
                    <div className="absolute left-full ml-3 z-50 bg-[#0f1b2d] text-white text-xs rounded-md py-1.5 px-2.5 pointer-events-none shadow-xl border border-slate-700 whitespace-nowrap min-w-[140px]">
                      <div className="flex items-center space-x-1.5 mb-0.5">
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: isDistressed ? '#dc2626' : cargo.color }}
                        />
                        <span className="font-semibold text-white truncate">{s.name}</span>
                        <span className="text-[10px] text-slate-400 font-mono">({s.shipId})</span>
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-slate-300">
                        <span className="capitalize">{s.status.replace('_', ' ')}</span>
                        <span className="font-mono text-amber-400">{s.speed.toFixed(1)} kn</span>
                      </div>
                      {isCaptainMode && (
                        <div
                          className={`mt-1 pt-1 border-t border-slate-700/60 text-[9px] font-bold uppercase tracking-wider ${
                            isAssignedCaptainShip ? 'text-amber-400' : 'text-slate-400'
                          }`}
                        >
                          {isAssignedCaptainShip ? 'Assigned Command Ship' : 'Read-only Traffic'}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* Full Expanded Panel Mode (300px) */
        <div className="flex flex-col h-full overflow-hidden w-full">
          {/* Header & Filter Bar */}
          <div className="p-3 border-b border-[#e3e7ec] bg-[#f8fafc] space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <span className="section-label">
                  {role === 'captain' ? 'Fleet Traffic' : 'Fleet Manifest'}
                </span>
                <span className="text-[11px] font-mono px-1.5 py-0.2 rounded bg-slate-200/80 text-slate-700 font-medium tabular-nums">
                  {filteredFleet.length} / {sortedFleet.length}
                </span>
              </div>
              <div className="flex items-center space-x-1.5">
                {distressedCount > 0 && (
                  <span className="flex items-center space-x-1 text-[10px] font-bold text-red-600 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded">
                    <AlertTriangle size={11} />
                    <span>{distressedCount} DISTRESS</span>
                  </span>
                )}
                <button
                  onClick={handleToggle}
                  className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded transition-editorial cursor-pointer"
                  title="Collapse fleet rail"
                >
                  <PanelLeftClose size={14} />
                </button>
              </div>
            </div>

            {/* Search Input */}
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-2.5 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter name, cargo, port..."
                className="w-full bg-white border border-[#e3e7ec] focus:border-amber-500 rounded-md pl-8 pr-3 py-1.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none transition-editorial shadow-xs"
              />
            </div>

            {/* Quick Filter Tags */}
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
                <button
                  key={tab.key}
                  onClick={() => setFilter(tab.key)}
                  className={`px-2 py-0.5 rounded-md whitespace-nowrap text-[11px] font-medium transition-editorial cursor-pointer ${
                    filter === tab.key
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'bg-white border border-[#e3e7ec] text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Vessel List */}
          <div className="flex-1 overflow-y-auto divide-y divide-[#e3e7ec]">
            {filteredFleet.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500">
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
                const isLowFuel =
                  ship.status === 'insufficient_fuel' ||
                  ship.status === 'no_fuel' ||
                  ship.fuel < 800;
                const fuelPercent = Math.min(100, Math.max(0, (ship.fuel / 8500) * 100));

                let rowClass = 'p-2.5 transition-editorial cursor-pointer flex flex-col justify-between ';
                if (isCaptainMode) {
                  if (isCaptainShip) {
                    rowClass += 'bg-amber-50/80 border-l-4 border-l-amber-500 opacity-100 font-medium';
                  } else if (isSelected) {
                    rowClass += 'bg-slate-100/90 border-l-4 border-l-slate-400 opacity-80';
                  } else {
                    rowClass += 'opacity-50 hover:opacity-90 hover:bg-slate-50 border-l-4 border-l-transparent';
                  }
                } else {
                  if (isSelected) {
                    rowClass += 'bg-amber-50/70 border-l-4 border-l-amber-500';
                  } else if (isDistressed) {
                    rowClass += 'bg-red-50/40 hover:bg-red-50/70 border-l-4 border-l-red-600';
                  } else {
                    rowClass += 'hover:bg-slate-50 border-l-4 border-l-transparent';
                  }
                }

                return (
                  <div
                    key={ship.shipId}
                    onClick={() => onSelectShip(ship.shipId)}
                    title={`${ship.name} (${ship.shipId}) · Status: ${ship.status.replace('_', ' ')}`}
                    className={rowClass}
                  >
                    {/* Row 1: Cargo dot, Name, ID, Speed */}
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
                          {isRerouting && (
                            <span className="absolute -inset-0.5 rounded-full border border-dashed border-amber-500 pointer-events-none" />
                          )}
                        </div>

                        <span className="text-xs font-semibold text-slate-900 truncate">
                          {ship.name}
                        </span>

                        <span className="text-[10px] text-slate-400 font-mono shrink-0">
                          {ship.shipId}
                        </span>

                        {isCaptainShip && (
                          <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.2 rounded bg-amber-100 text-amber-800">
                            Assigned
                          </span>
                        )}

                        {isOtherCaptainShip && (
                          <span className="text-[9px] font-medium uppercase tracking-wider px-1.5 py-0.2 rounded bg-slate-200/70 text-slate-500">
                            Traffic
                          </span>
                        )}
                      </div>

                      {/* Speed badge */}
                      <span className="text-xs font-semibold font-mono text-slate-800 tabular-nums shrink-0">
                        {ship.speed.toFixed(1)} <span className="text-[10px] text-slate-400 font-normal">kn</span>
                      </span>
                    </div>

                    {/* Row 2: Cargo Pill, Destination, Status Badge */}
                    <div className="flex items-center justify-between text-[11px] text-slate-500 mt-0.5 mb-1.5">
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

                      <span
                        className={`text-[9px] font-bold uppercase px-1.5 py-0.2 rounded shrink-0 ${
                          isDistressed
                            ? 'bg-red-600 text-white'
                            : isRerouting
                            ? 'bg-amber-100 text-amber-800'
                            : isLowFuel
                            ? 'bg-red-100 text-red-700'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {ship.status.replace('_', ' ')}
                      </span>
                    </div>

                    {/* Row 3: Thin Fuel Line */}
                    <div className="w-full bg-slate-100 h-1 rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all duration-300 ${
                          fuelPercent < 15
                            ? 'bg-red-600'
                            : fuelPercent < 30
                            ? 'bg-amber-500'
                            : 'bg-slate-400'
                        }`}
                        style={{ width: `${fuelPercent}%` }}
                      />
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
