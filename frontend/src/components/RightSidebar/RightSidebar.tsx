import React from 'react';
import { RightDockRail } from './RightDockRail';
import { RightSidebarDrawer } from './RightSidebarDrawer';

export const RightSidebar: React.FC = () => {
  return (
    <div className="flex h-full select-none shrink-0 z-40">
      <RightSidebarDrawer />
      <RightDockRail />
    </div>
  );
};

