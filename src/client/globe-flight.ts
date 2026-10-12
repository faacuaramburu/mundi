import { Quaternion, Vector3 } from 'three';

/** A time-based arc around the globe, optionally adjusting the camera radius. */
export class GlobeFlight {
  readonly duration: number;
  private from: Vector3;
  private destination: Vector3;
  private targetFrom: Vector3;
  private rotation: Quaternion;
  private step = new Quaternion();
  private radius: number;

  constructor(from: Vector3, destination: Vector3, target: Vector3, private startedAt: number, reduced: boolean,
    private destinationRadius = from.length()) {
    this.from = from.clone();
    this.radius = from.length();
    this.destination = destination.clone().setLength(this.destinationRadius);
    this.targetFrom = target.clone();
    const angle = from.angleTo(destination);
    this.rotation = new Quaternion().setFromUnitVectors(from.clone().normalize(), destination.clone().normalize());
    this.duration = reduced ? 240 : 420 + angle / Math.PI * 480;
  }

  update(position: Vector3, target: Vector3, now: number): boolean {
    const progress = Math.max(0, Math.min(1, (now - this.startedAt) / this.duration));
    const eased = progress * progress * (3 - 2 * progress);
    this.step.identity().slerp(this.rotation, eased);
    position.copy(this.from).applyQuaternion(this.step).setLength(this.radius + (this.destinationRadius - this.radius) * eased);
    target.copy(this.targetFrom).multiplyScalar(1 - eased);
    if (progress === 1) position.copy(this.destination);
    return progress === 1;
  }
}
