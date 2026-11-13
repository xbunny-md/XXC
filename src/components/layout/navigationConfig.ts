import type { LucideIcon } from 'lucide-react';
import {
  Award,
  BarChart3,
  Bookmark,
  BookOpen,
  Calendar,
  GraduationCap,
  Home,
  Megaphone,
  MessageSquare,
  Phone,
  SearchCheck,
  ShieldCheck,
  User,
  Users,
} from 'lucide-react';
import { isAdminRole, ModuleId, UserRole } from '../../types/luga';

export interface NavItemConfig {
  id: ModuleId;
  label: string;
  shortLabel: string;
  group: 'Community' | 'Academics' | 'Campus Life' | 'Account';
  description: string;
  icon: LucideIcon;
  adminOnly?: boolean;
}

export const NAV_ITEMS: NavItemConfig[] = [
  {
    id: 'reels',
    label: 'LUGA REELS',
    shortLabel: 'Reels',
    group: 'Community',
    description: 'Vertical campus photos and videos',
    icon: Home,
  },
  {
    id: 'messages',
    label: 'Messages',
    shortLabel: 'Chat',
    group: 'Community',
    description: 'Private one-to-one messaging with school members',
    icon: MessageSquare,
  },
  {
    id: 'calls',
    label: 'Call History',
    shortLabel: 'Calls',
    group: 'Community',
    description: 'Audio & video calls, missed calls, and quick callbacks',
    icon: Phone,
  },
  {
    id: 'groups',
    label: 'Groups',
    shortLabel: 'Groups',
    group: 'Community',
    description: 'Classes, subjects, sports, clubs, and alumni',
    icon: Users,
  },
  {
    id: 'announcements',
    label: 'Announcements',
    shortLabel: 'Notices',
    group: 'Community',
    description: 'Official school notices and pinned updates',
    icon: Megaphone,
  },
  {
    id: 'schedule',
    label: 'Timetable & Events',
    shortLabel: 'Schedule',
    group: 'Academics',
    description: 'Class timetables, exam schedules, and calendar',
    icon: Calendar,
  },
  {
    id: 'results',
    label: 'Academic Results',
    shortLabel: 'Results',
    group: 'Academics',
    description: 'Private examination marks and academic history',
    icon: GraduationCap,
  },
  {
    id: 'resources',
    label: 'Study Resources',
    shortLabel: 'Resources',
    group: 'Academics',
    description: 'Study notes, assignments, and past papers',
    icon: BookOpen,
  },
  {
    id: 'polls',
    label: 'Polls & Voting',
    shortLabel: 'Polls',
    group: 'Campus Life',
    description: 'Community polls and student voting',
    icon: BarChart3,
  },
  {
    id: 'achievements',
    label: 'Achievements',
    shortLabel: 'Honors',
    group: 'Campus Life',
    description: 'Academic, sports, leadership, and competition awards',
    icon: Award,
  },
  {
    id: 'lost_found',
    label: 'Lost & Found',
    shortLabel: 'Lost/Found',
    group: 'Campus Life',
    description: 'Report or reclaim missing school items',
    icon: SearchCheck,
  },
  {
    id: 'bookmarks',
    label: 'Saved Items',
    shortLabel: 'Saved',
    group: 'Campus Life',
    description: 'Bookmarked posts, announcements, and resources',
    icon: Bookmark,
  },
  {
    id: 'profile',
    label: 'Profile & Settings',
    shortLabel: 'Profile',
    group: 'Account',
    description: 'Personal details, theme mode, and role permissions',
    icon: User,
  },
  {
    id: 'admin',
    label: 'Admin Console',
    shortLabel: 'Admin',
    group: 'Account',
    description: 'Approvals, school codes, moderation reports, and logs',
    icon: ShieldCheck,
    adminOnly: true,
  },
];

export function getVisibleNavItems(role?: UserRole): NavItemConfig[] {
  return NAV_ITEMS.filter((item) => !item.adminOnly || isAdminRole(role));
}
