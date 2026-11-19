"use client";

import React from "react";
import { ChevronLeft, ChevronRight, ShieldCheck, Spade } from "lucide-react";
import type { TabId } from "@/lib/studyNavigation";

interface NavigationItem {
  id: string;
  domain: string;
  label: string;
  targetTab: TabId;
  dataTour: string;
  icon: React.ReactNode;
  badge?: number;
}

/** Apenas apresentação: os destinos e callbacks continuam pertencendo ao aplicativo. */
export function StudioSidebar({ items, activeDomain, collapsed, onToggle, onNavigate }: {
  items: NavigationItem[];
  activeDomain: string;
  collapsed: boolean;
  onToggle: () => void;
  onNavigate: (tab: TabId) => void;
}) {
  return (
    <aside className="studio-sidebar" aria-label="Navegação do TreinerLM">
      <div className="studio-brand">
        <Spade className="studio-brand-symbol" aria-hidden="true" />
        <div className="studio-brand-copy"><strong>Treiner<span>LM</span></strong><small>Estúdio de Poker · MTT</small></div>
      </div>
      <div className="studio-nav-caption">SEU ESPAÇO DE ESTUDO</div>
      <nav data-tour="navigation" aria-label="Áreas principais de estudo" className="studio-navigation">
        {items.map((item) => (
          <button key={item.id} type="button" data-tour={item.dataTour}
            aria-current={activeDomain === item.domain ? "page" : undefined}
            aria-label={item.label} title={collapsed ? item.label : undefined}
            onClick={() => onNavigate(item.targetTab)}>
            {item.icon}<span className="studio-nav-label">{item.label}</span>
            {item.badge !== undefined && <span className="studio-nav-count">{item.badge}</span>}
          </button>
        ))}
      </nav>
      <div className="studio-sidebar-foot">
        <div className="studio-local-note"><ShieldCheck size={18} aria-hidden="true" /><div><strong>Estudo no seu ritmo</strong><small>Treino e revisão pós-sessão</small></div></div>
        <button type="button" className="studio-collapse" onClick={onToggle} aria-expanded={!collapsed}
          aria-label={collapsed ? "Expandir menu lateral" : "Recolher menu lateral"}>
          {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}<span>Recolher menu</span>
        </button>
      </div>
    </aside>
  );
}
