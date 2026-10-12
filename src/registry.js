import { StraightWizard, DistanceWizard, GyroWizard, GroundWizard, ColorWizard } from './wizards.jsx';
import { NStraight, NDistance, NGyro, NGround, NColor } from './normal.jsx';

// Each calibration has an expert wizard (Comp) and a normal one (NComp).
export const WIZARDS = [
  { id: 'straight', icon: 'straight', Comp: StraightWizard, NComp: NStraight, titleKey: 'straight.title', descKey: 'straight.short', nTitleKey: 'n.straight.title', nDescKey: 'n.straight.desc' },
  { id: 'distance', icon: 'distance', Comp: DistanceWizard, NComp: NDistance, titleKey: 'distance.title', descKey: 'distance.short', nTitleKey: 'n.distance.title', nDescKey: 'n.distance.desc' },
  { id: 'gyro', icon: 'gyro', Comp: GyroWizard, NComp: NGyro, titleKey: 'gyro.title', descKey: 'gyro.short', nTitleKey: 'n.gyro.title', nDescKey: 'n.gyro.desc' },
  { id: 'ground', icon: 'ground', Comp: GroundWizard, NComp: NGround, titleKey: 'ground.title', descKey: 'ground.short', nTitleKey: 'n.ground.title', nDescKey: 'n.ground.desc' },
  { id: 'color', icon: 'color', Comp: ColorWizard, NComp: NColor, titleKey: 'color.title', descKey: 'color.short', nTitleKey: 'n.color.title', nDescKey: 'n.color.desc' },
];
