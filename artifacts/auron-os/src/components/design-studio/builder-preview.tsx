import { useEffect, useMemo, useRef } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { partsBounds, type CustomSpec, type Finishes, type Part } from "@workspace/design-model";
import { ObjectModel } from "./object-mesh";
import { MM } from "./scene-builders";

// Live 3D preview in the Custom Builder: the same parts and mesh code as the
// editor's 3D view, so what you see here is what gets placed. Loaded only
// when the builder opens. Orbit with one finger, pinch to zoom.

export default function BuilderPreview({ parts, spec, color, accentColor, finishes, dark, fitKey }: { parts: Part[]; spec: CustomSpec; color: string; accentColor: string; finishes?: Finishes; dark: boolean; fitKey: number }) {
  const object = useMemo(
    () => ({ type: "custom" as const, width: 1, depth: 1, height: 1, props: {}, color, accentColor, custom: spec, finishes }),
    [spec, color, accentColor, finishes],
  );
  return (
    <Canvas
      className="!absolute inset-0 touch-none"
      frameloop="demand"
      dpr={[1, 2]}
      shadows
      camera={{ fov: 40, near: 0.01, far: 1000, position: [3, 2.5, 4] }}
      gl={{ antialias: true }}
      aria-label="3D preview of the custom object"
      role="img"
      data-testid="builder-preview-canvas"
    >
      <color attach="background" args={[dark ? "#0b0f17" : "#eef0f4"]} />
      <hemisphereLight args={["#ffffff", dark ? "#1f2937" : "#cbd5e1", 0.9]} />
      <directionalLight position={[4, 8, 6]} intensity={1.4} castShadow shadow-mapSize={[1024, 1024]} />
      <directionalLight position={[-5, 3, -4]} intensity={0.35} />
      <Floor parts={parts} dark={dark} />
      <ObjectModel object={object} parts={parts} />
      <Rig parts={parts} fitKey={fitKey} />
    </Canvas>
  );
}

function Floor({ parts, dark }: { parts: Part[]; dark: boolean }) {
  const b = partsBounds(parts);
  const span = b ? Math.max(b.max[0] - b.min[0], b.max[2] - b.min[2], 1000) * MM * 2.5 : 5;
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position-y={-0.001} receiveShadow>
        <planeGeometry args={[span, span]} />
        <meshStandardMaterial color={dark ? "#111827" : "#f8fafc"} roughness={1} />
      </mesh>
      <gridHelper args={[span, Math.max(2, Math.round(span / 0.5)), dark ? "#334155" : "#cbd5e1", dark ? "#1e293b" : "#e2e8f0"]} position-y={0} />
    </group>
  );
}

function Rig({ parts, fitKey }: { parts: Part[]; fitKey: number }) {
  const { camera, gl, invalidate, size } = useThree();
  const controls = useMemo(() => new OrbitControls(camera, gl.domElement), [camera, gl]);
  const fitted = useRef("");
  useEffect(() => {
    controls.enableDamping = false;
    controls.screenSpacePanning = true;
    controls.maxPolarAngle = Math.PI * 0.495;
    controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
    controls.connect(gl.domElement);
    const onChange = () => invalidate();
    controls.addEventListener("change", onChange);
    return () => {
      controls.removeEventListener("change", onChange);
      controls.disconnect();
      controls.dispose();
    };
  }, [controls, gl, invalidate]);

  // Frame the object on open and when asked ("Fit"), not on every edit, so orbiting isn't undone while typing values.
  useEffect(() => {
    const b = partsBounds(parts);
    // Refit on "Fit", on a new object, and when the pane is resized (switching panes, rotating the iPad).
    const key = `${fitKey}:${Math.round(size.width)}x${Math.round(size.height)}`;
    if (!b || fitted.current === key) {
      invalidate();
      return;
    }
    fitted.current = key;
    const min = new THREE.Vector3(...b.min).multiplyScalar(MM);
    const max = new THREE.Vector3(...b.max).multiplyScalar(MM);
    const centre = min.clone().add(max).multiplyScalar(0.5);
    const radius = Math.max(max.clone().sub(min).length() / 2, 0.2);
    const persp = camera as THREE.PerspectiveCamera;
    // Fit inside the narrower of the vertical and horizontal fields of view (the pane is often tall and thin).
    const halfV = (persp.fov * Math.PI) / 360;
    const halfH = Math.atan(Math.tan(halfV) * Math.max(0.2, size.width / Math.max(1, size.height)));
    const dist = (radius / Math.sin(Math.min(halfV, halfH))) * 1.1;
    const dir = new THREE.Vector3(0.55, 0.45, 1).normalize();
    camera.position.copy(centre).addScaledVector(dir, dist);
    persp.near = Math.max(0.005, dist / 200);
    persp.far = dist * 50;
    persp.updateProjectionMatrix();
    controls.target.copy(centre);
    controls.update();
    invalidate();
  }, [parts, fitKey, camera, controls, invalidate, size.width, size.height]);
  return null;
}
