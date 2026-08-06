import React, { useState, useRef, useEffect } from 'react';
import { StyleSheet, View, TouchableOpacity, Text, Modal, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { FlightData } from '@/types/flightT';

interface SimulatorWebViewProps {
  flightData?: FlightData;
  livePoint?: {
    x: number;
    y: number;
    z: number;
    yaw: number;
    sensors: { front: number; back: number; left: number; right: number; up: number; down: number; };
  };
}

export default function SimulatorWebView({ flightData, livePoint }: SimulatorWebViewProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isModalLoading, setIsModalLoading] = useState(true);
  const webviewRef = useRef<WebView>(null);
  const modalWebviewRef = useRef<WebView>(null);

  useEffect(() => {
    if (livePoint) {
      const script = `if (window.pushLivePoint) { window.pushLivePoint(${JSON.stringify(livePoint)}); } true;`;
      if (isFullscreen && modalWebviewRef.current) {
        modalWebviewRef.current.injectJavaScript(script);
      } else if (!isFullscreen && webviewRef.current) {
        webviewRef.current.injectJavaScript(script);
      }
    }
  }, [livePoint, isFullscreen]);
  
  const serializedData = JSON.stringify(flightData);

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
      <style>
        body { margin: 0; padding: 0; overflow: hidden; background-color: #0B0E11; color: white; touch-action: none; }
        #canvas-container { width: 100vw; height: 100vh; }
      </style>
      <script src="https://unpkg.com/three@0.128.0/build/three.min.js"></script>
      <script src="https://unpkg.com/three@0.128.0/examples/js/controls/OrbitControls.js"></script>
    </head>
    <body>
      <div id="canvas-container"></div>
      <script>
        try {
          const flightData = ${serializedData};
          
          const scene = new THREE.Scene();
          scene.background = new THREE.Color(0x0b0e11);

          const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
          
          const renderer = new THREE.WebGLRenderer({ antialias: true });
          renderer.setSize(window.innerWidth, window.innerHeight);
          document.getElementById('canvas-container').appendChild(renderer.domElement);

          const controls = new THREE.OrbitControls(camera, renderer.domElement);
          controls.enableDamping = true;
          controls.dampingFactor = 0.05;

          const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
          scene.add(ambientLight);
          
          const gridHelper = new THREE.GridHelper(30, 30, 0x1A222A, 0x1E262E);
          scene.add(gridHelper);

          const pathPoints = [];
          let currentX = 0;
          let currentY = 0;
          const raysGroup = new THREE.Group();
          scene.add(raysGroup);

          const colors = {
            front: 0x30d158, back: 0xe5484d, left: 0xff9f0a, 
            right: 0xbf5af2, up: 0x5ac8fa, down: 0xffd60a
          };

          let lastValidP3D = new THREE.Vector3(0,0,0);
          let pathLine = null;

          if (flightData && flightData.time) {
            const length = flightData.time.length;
            for (let i = 0; i < length; i++) {
              const t = flightData.time[i];
              const yawRad = (flightData.yaw[i] || 0) * (Math.PI / 180);
              
              if (i > 0) {
                const dt = t - flightData.time[i-1];
                currentX += Math.cos(yawRad) * 1.5 * dt;
                currentY += Math.sin(yawRad) * 1.5 * dt;
              }

              const heightZ = (flightData.downSensor[i] || 0);
              const p3d = new THREE.Vector3(currentX, heightZ, currentY);
              pathPoints.push(p3d);
              lastValidP3D = p3d;

              const sensorRays = [
                { val: flightData.frontSensor[i], dir: new THREE.Vector3(Math.cos(yawRad), 0, Math.sin(yawRad)), col: colors.front },
                { val: flightData.backSensor[i], dir: new THREE.Vector3(-Math.cos(yawRad), 0, -Math.sin(yawRad)), col: colors.back },
                { val: flightData.leftSensor[i], dir: new THREE.Vector3(-Math.sin(yawRad), 0, Math.cos(yawRad)), col: colors.left },
                { val: flightData.rightSensor[i], dir: new THREE.Vector3(Math.sin(yawRad), 0, -Math.cos(yawRad)), col: colors.right },
                { val: flightData.TopSensor[i], dir: new THREE.Vector3(0, 1, 0), col: colors.up }
              ];

              sensorRays.forEach(ray => {
                if (ray.val && ray.val < 15.0) {
                  const endpoint = p3d.clone().add(ray.dir.multiplyScalar(ray.val));
                  const lineGeo = new THREE.BufferGeometry().setFromPoints([p3d, endpoint]);
                  const lineMat = new THREE.LineBasicMaterial({ color: ray.col, transparent: true, opacity: 0.3 });
                  raysGroup.add(new THREE.Line(lineGeo, lineMat));
                  
                  const dotGeo = new THREE.SphereGeometry(0.05, 4, 4);
                  const dotMat = new THREE.MeshBasicMaterial({ color: ray.col });
                  const dot = new THREE.Mesh(dotGeo, dotMat);
                  dot.position.copy(endpoint);
                  scene.add(dot);
                }
              });
            }

            if (pathPoints.length > 1) {
              const pathGeometry = new THREE.BufferGeometry().setFromPoints(pathPoints);
              const pathMaterial = new THREE.LineBasicMaterial({ color: 0xE8EDF2, linewidth: 2 });
              pathLine = new THREE.Line(pathGeometry, pathMaterial);
              scene.add(pathLine);
              
              const midPoint = pathPoints[Math.floor(pathPoints.length / 2)];
              controls.target.copy(midPoint);
              camera.position.set(midPoint.x + 10, midPoint.y + 8, midPoint.z + 10);
            }
          }

          const droneGeo = new THREE.SphereGeometry(0.3, 8, 8);
          const droneMat = new THREE.MeshBasicMaterial({ color: 0x3A8FCC });
          const droneMesh = new THREE.Mesh(droneGeo, droneMat);
          droneMesh.position.copy(lastValidP3D);
          scene.add(droneMesh);
          
          if (!flightData || !flightData.time) {
            camera.position.set(5, 5, 5);
            controls.target.set(0, 0, 0);
          }

          window.pushLivePoint = function(pt) {
            const p3d = new THREE.Vector3(pt.x, pt.z, pt.y); // Note mapping from (x,y,z) drone space
            pathPoints.push(p3d);
            lastValidP3D = p3d;

            if (pathPoints.length > 1) {
              if (pathLine) scene.remove(pathLine);
              const pathGeometry = new THREE.BufferGeometry().setFromPoints(pathPoints);
              const pathMaterial = new THREE.LineBasicMaterial({ color: 0x30d158, linewidth: 3 });
              pathLine = new THREE.Line(pathGeometry, pathMaterial);
              scene.add(pathLine);
            }
            
            droneMesh.position.copy(p3d);

            const yawRad = pt.yaw * (Math.PI / 180);
            const sensorRays = [
              { val: pt.sensors.front, dir: new THREE.Vector3(Math.cos(yawRad), 0, Math.sin(yawRad)), col: colors.front },
              { val: pt.sensors.back, dir: new THREE.Vector3(-Math.cos(yawRad), 0, -Math.sin(yawRad)), col: colors.back },
              { val: pt.sensors.left, dir: new THREE.Vector3(-Math.sin(yawRad), 0, Math.cos(yawRad)), col: colors.left },
              { val: pt.sensors.right, dir: new THREE.Vector3(Math.sin(yawRad), 0, -Math.cos(yawRad)), col: colors.right },
              { val: pt.sensors.up, dir: new THREE.Vector3(0, 1, 0), col: colors.up },
              { val: pt.sensors.down, dir: new THREE.Vector3(0, -1, 0), col: colors.down }
            ];

            sensorRays.forEach(ray => {
              if (ray.val > 0 && ray.val < 15.0) {
                const endpoint = p3d.clone().add(ray.dir.multiplyScalar(ray.val));
                const lineGeo = new THREE.BufferGeometry().setFromPoints([p3d, endpoint]);
                const lineMat = new THREE.LineBasicMaterial({ color: ray.col, transparent: true, opacity: 0.3 });
                raysGroup.add(new THREE.Line(lineGeo, lineMat));
                
                const dotGeo = new THREE.SphereGeometry(0.05, 4, 4);
                const dotMat = new THREE.MeshBasicMaterial({ color: ray.col });
                const dot = new THREE.Mesh(dotGeo, dotMat);
                dot.position.copy(endpoint);
                scene.add(dot);
              }
            });
            
            controls.target.copy(p3d);
          };

          // Handle device rotation or fullscreen transitions
          window.addEventListener('resize', () => {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
          });

          function animate() {
            requestAnimationFrame(animate);
            controls.update();
            renderer.render(scene, camera);
          }
          animate();

        } catch (err) {
          console.error(err);
        }
      </script>
    </body>
    </html>
  `;

  // A reusable WebView component to keep the markup clean
  const WebViewComponent = ({ webRef, onLoadEnd }: { webRef: React.RefObject<WebView>, onLoadEnd?: () => void }) => (
    <WebView
      ref={webRef}
      originWhitelist={['*']}
      source={{ html: htmlContent, baseUrl: 'https://localhost' }}
      style={styles.webview}
      javaScriptEnabled={true}
      domStorageEnabled={true}
      mixedContentMode="always"
      nestedScrollEnabled={true} 
      onLoadEnd={onLoadEnd}
    />
  );

  return (
    <>
      <View style={styles.inlineContainer}>
        <WebViewComponent webRef={webviewRef} />
        <TouchableOpacity style={styles.expandButton} onPress={() => {
          setIsModalLoading(true); // Reset loading state when opening
          setIsFullscreen(true);
        }}>
          <Text style={styles.buttonText}>⛶ FULLSCREEN</Text>
        </TouchableOpacity>
      </View>

      <Modal visible={isFullscreen} animationType="slide" onRequestClose={() => setIsFullscreen(false)}>
        <SafeAreaView style={styles.modalContainer}>
          {isModalLoading && (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator size="large" color="#3A8FCC" />
              <Text style={styles.loadingText}>Fetching 3D Engine...</Text>
            </View>
          )}
          <WebViewComponent webRef={modalWebviewRef} onLoadEnd={() => setIsModalLoading(false)} />
          <TouchableOpacity style={styles.closeButton} onPress={() => setIsFullscreen(false)}>
            <Text style={styles.buttonText}>✕ CLOSE</Text>
          </TouchableOpacity>
        </SafeAreaView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  inlineContainer: { 
    flex: 1, 
    width: '100%', 
    height: '100%',
    position: 'relative'
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#0B0E11',
    position: 'relative'
  },
  webview: { 
    flex: 1, 
    backgroundColor: '#0B0E11' 
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0B0E11',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 5,
  },
  loadingText: {
    color: '#E8EDF2',
    fontFamily: 'monospace',
    marginTop: 16,
    fontSize: 14,
  },
  expandButton: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    backgroundColor: 'rgba(26, 34, 42, 0.85)',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#3A8FCC'
  },
  closeButton: {
    position: 'absolute',
    top: 20,
    right: 20,
    backgroundColor: 'rgba(229, 72, 77, 0.85)',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#B3161B',
    zIndex: 10
  },
  buttonText: {
    color: '#E8EDF2',
    fontFamily: 'monospace',
    fontWeight: 'bold',
    fontSize: 12,
    letterSpacing: 1
  }
});