// ===========================================================================
//  SAFE TO CHANGE WITHOUT THE DRONE.
// ===========================================================================
//
// This file only draws data that has already been recorded. Nothing here can
// stop the drone flying, send it a command, or corrupt what it stores. Break it
// and the worst case is a screen that looks wrong.
//
// TWO THINGS ABOUT THE DATA, both learned the hard way:
//
//   Positions (posX/posY/posZ) are the drone's own estimate, in metres, and
//   they are real. An older version dead-reckoned a fake straight line here,
//   which made every flight look identical. If a path ever looks suspiciously
//   tidy, check the real positions are present rather than being fallen back
//   from.
//
//   yaw is the heading in degrees and it is what places the wall readings. A
//   front reading of 800mm is 800mm in whatever direction the drone was facing,
//   and once it can turn that is not the same direction twice. yaw was
//   hardcoded to zero for a long time, which drew every wall of every flight as
//   though the drone never turned -- the path was right and the room around it
//   was fiction. Flights recorded before that fix have yaw 0 throughout and
//   will always look flat; that is the recording, not the renderer.
//
// WHY THIS VIEW WAS REBUILT. The old one drew all six rays from every sample at
// once. Fifty samples is three hundred lines, most of them crossing the whole
// room, and the up-rays in particular drew a two-metre blue curtain over
// everything. The result was a scribble you could not read a room out of.
//
// So the drawing is split in two. The WALLS are the ray endpoints -- each one a
// place a laser actually hit something -- drawn as a dim point cloud, because
// points accumulate into surfaces while lines just overlap. The RAYS belong to
// one moment: only the sample being played back draws them, brightly. Scrub
// through the flight and you see what the drone saw, when it saw it, instead of
// everything it ever saw piled on top of itself.
// ===========================================================================

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

  const serializedData = JSON.stringify(flightData ?? null);

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
      <style>
        body { margin: 0; padding: 0; overflow: hidden; background-color: #0B0E11; color: #E8EDF2;
               font-family: monospace; touch-action: none; }
        #canvas-container { position: absolute; inset: 0; }

        .panel {
          position: absolute;
          background: rgba(11,14,17,0.82);
          border: 1px solid #1E262E;
          border-radius: 4px;
          padding: 8px 10px;
          font-size: 10px;
          line-height: 1.5;
          z-index: 4;
        }

        /* Sensor readout. Each row is the distance AND a bar as long as that
           distance is, relative to the longest reading on screen -- so the six
           can be compared at a glance instead of read one number at a time. */
        #hud { top: 8px; left: 8px; min-width: 150px; }
        #hud .ttl { color: #7D8C9A; letter-spacing: 1px; }
        #hud .big { font-size: 13px; font-weight: bold; }
        .row { display: flex; align-items: center; gap: 5px; margin-top: 2px; }
        .sw { width: 8px; height: 8px; border-radius: 2px; flex: none; }
        .nm { width: 34px; color: #7D8C9A; flex: none; }
        .vl { width: 46px; text-align: right; flex: none; }
        .bar { height: 4px; border-radius: 2px; flex: none; opacity: 0.85; }

        /* Playback. Sits along the bottom clear of the legend. */
        #controls { bottom: 8px; left: 8px; right: 8px; display: flex;
                    align-items: center; gap: 8px; }
        #play { background: #1A222A; color: #E8EDF2; border: 1px solid #3A8FCC;
                border-radius: 3px; font-family: monospace; font-size: 12px;
                padding: 4px 9px; flex: none; }
        #scrub { flex: 1; min-width: 40px; accent-color: #3A8FCC; }
        #spd { background: #1A222A; color: #E8EDF2; border: 1px solid #2A343E;
               border-radius: 3px; font-family: monospace; font-size: 11px;
               padding: 4px 6px; flex: none; }

        #legend { bottom: 44px; left: 8px; }
        #legend .g { display: grid; grid-template-columns: auto auto; gap: 1px 10px; }
        #legend div { display: flex; align-items: center; gap: 5px; }
        #scale { bottom: 44px; right: 8px; color: #7D8C9A; text-align: right; }
        #empty { position: absolute; inset: 0; display: flex; align-items: center;
                 justify-content: center; color: #7D8C9A; font-size: 12px; z-index: 3; }
      </style>
      <!-- unpkg, NOT cdnjs. cdnjs hosts three's build output only, so
           examples/js/controls/OrbitControls.js 404s there and THREE.OrbitControls
           is never defined -- "not a constructor", and a blank 3D view. Changing
           this CDN broke the whole page once already. -->
      <script src="https://unpkg.com/three@0.128.0/build/three.min.js"></script>
      <script src="https://unpkg.com/three@0.128.0/examples/js/controls/OrbitControls.js"></script>
    </head>
    <body>
      <div id="canvas-container"></div>

      <div id="hud" class="panel">
        <div class="ttl">T <span id="t" class="big">0.0</span>s &nbsp; ALT <span id="alt" class="big">0</span>mm</div>
        <div id="sensors"></div>
      </div>

      <div id="legend" class="panel">
        <div class="g">
          <div><span class="sw" style="background:#30d158"></span>FRONT</div>
          <div><span class="sw" style="background:#bf5af2"></span>RIGHT</div>
          <div><span class="sw" style="background:#e5484d"></span>BACK</div>
          <div><span class="sw" style="background:#5ac8fa"></span>UP</div>
          <div><span class="sw" style="background:#ff9f0a"></span>LEFT</div>
          <div><span class="sw" style="background:#ffd60a"></span>DOWN</div>
        </div>
        <div style="color:#7D8C9A;margin-top:4px">white line = flight path</div>
      </div>

      <div id="scale" class="panel">grid square = 1 m</div>

      <div id="controls" class="panel">
        <button id="play">&#9654;</button>
        <input id="scrub" type="range" min="0" max="0" value="0" step="1" />
        <select id="spd">
          <option value="1">1x</option>
          <option value="2">2x</option>
          <option value="4">4x</option>
        </select>
      </div>

      <script>
        try {
          var flightData = ${serializedData};

          var scene = new THREE.Scene();
          scene.background = new THREE.Color(0x0b0e11);

          var camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
          var renderer = new THREE.WebGLRenderer({ antialias: true });
          renderer.setSize(window.innerWidth, window.innerHeight);
          document.getElementById('canvas-container').appendChild(renderer.domElement);

          var controls = new THREE.OrbitControls(camera, renderer.domElement);
          controls.enableDamping = true;
          controls.dampingFactor = 0.05;

          scene.add(new THREE.AmbientLight(0xffffff, 0.8));

          // One grid square is one metre, and the panel bottom-right says so.
          // Without a stated scale a 2m arena and a 20m corridor draw
          // identically, which is most of why these pictures were hard to read.
          scene.add(new THREE.GridHelper(30, 30, 0x1A222A, 0x1E262E));

          var colors = {
            front: 0x30d158, back: 0xe5484d, left: 0xff9f0a,
            right: 0xbf5af2, up: 0x5ac8fa, down: 0xffd60a
          };
          var cssColors = {
            front: '#30d158', back: '#e5484d', left: '#ff9f0a',
            right: '#bf5af2', up: '#5ac8fa', down: '#ffd60a'
          };
          var ORDER = ['front', 'back', 'left', 'right', 'up', 'down'];

          // --- the drone -----------------------------------------------------
          //
          // A ball has no orientation, so there was no way to tell which way
          // FRONT pointed. This is the Crazyflie's actual X layout, and the two
          // front arms are the FRONT sensor's green while the rear pair are the
          // BACK sensor's red -- so heading is readable from any camera angle,
          // and it matches the rays.
          var droneMesh = new THREE.Group();
          var bodyMat  = new THREE.MeshBasicMaterial({ color: 0x24303B });
          var frontMat = new THREE.MeshBasicMaterial({ color: colors.front });
          var backMat  = new THREE.MeshBasicMaterial({ color: colors.back });
          var rotorMat = new THREE.MeshBasicMaterial({ color: 0xE8EDF2, transparent: true, opacity: 0.45 });

          droneMesh.add(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.07, 0.16), bodyMat));

          var nose = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.13, 8), frontMat);
          nose.rotation.z = -Math.PI / 2;      // point along +X, which is FRONT
          nose.position.set(0.14, 0, 0);
          droneMesh.add(nose);

          var rotors = [];
          [[1,1],[1,-1],[-1,1],[-1,-1]].forEach(function (c) {
            var ax = c[0] * 0.13, az = c[1] * 0.13;
            var arm = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.018, 0.018),
                                     c[0] > 0 ? frontMat : backMat);
            arm.position.set(ax / 2, 0, az / 2);
            arm.rotation.y = -Math.atan2(az, ax);
            droneMesh.add(arm);

            var rotor = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.01, 14), rotorMat);
            rotor.position.set(ax, 0.028, az);
            droneMesh.add(rotor);
            rotors.push(rotor);
          });
          scene.add(droneMesh);

          // --- building the flight -------------------------------------------
          //
          // Drone (x, y, z) maps to scene (x, z, -y).
          //
          // three.js is Y-up and the drone is Z-up, so the drone's Z becomes the
          // scene's Y. AND THE DRONE'S Y IS NEGATED. That minus is not a fudge,
          // it is the difference between a map and its reflection: swapping two
          // axes of a right-handed frame produces a left-handed one, which draws
          // mirrored. Every ray stayed consistent with the path so nothing
          // looked broken -- but a wall the drone had on its right came out on
          // its left. Negating one axis restores the handedness.
          //
          // Every direction below therefore uses scene Z = -(drone y):
          //   forward  ( cos yaw, 0, -sin yaw)
          //   left     (-sin yaw, 0, -cos yaw)
          function rayDirs(yawRad) {
            return {
              front: new THREE.Vector3(Math.cos(yawRad), 0, -Math.sin(yawRad)),
              back:  new THREE.Vector3(-Math.cos(yawRad), 0, Math.sin(yawRad)),
              left:  new THREE.Vector3(-Math.sin(yawRad), 0, -Math.cos(yawRad)),
              right: new THREE.Vector3(Math.sin(yawRad), 0, Math.cos(yawRad)),
              up:    new THREE.Vector3(0, 1, 0),
              down:  new THREE.Vector3(0, -1, 0)
            };
          }

          var samples = [];       // one entry per recorded moment
          var pathPoints = [];
          var pathLine = null;
          var liveRays = new THREE.Group();   // only ever the current sample
          scene.add(liveRays);

          function addSample(p3d, yawDeg, s, t) {
            samples.push({ p: p3d, yaw: yawDeg, s: s, t: t });
            pathPoints.push(p3d);
          }

          if (flightData && flightData.time && flightData.time.length) {
            var n = flightData.time.length;
            var hasPos = !!(flightData.posX && flightData.posY && flightData.posZ &&
                            flightData.posX.length === n);
            var wallPts = [];
            var wallCols = [];

            // WHERE THE FLIGHT STOPPED BEING A FLIGHT.
            //
            // When the aircraft goes over, its position estimate goes with it:
            // the Flow deck loses the floor and the numbers run away to things
            // like -3904, 8596, 14137 mm, metres outside any room it was ever
            // in. Drawing those is what turns a crash into an unreadable
            // scribble -- and worse, the camera frames the whole lot, so the
            // part anyone wants to look at ends up a dot in the corner.
            //
            // Two things give it away, and either is enough. Tilt past 60
            // degrees is not flight, it is tumbling. And a step of more than a
            // metre between two samples a second apart is not possible at a
            // cruise of 200mm/s, so the estimate has diverged whatever the
            // attitude says.
            //
            // Everything from that point on is dropped: no path, no walls, no
            // camera framing. The flight is drawn up to the moment it ended and
            // the spot is marked, which is the thing actually worth seeing.
            var CRASH_TILT_DEG = 60;
            var CRASH_JUMP_M = 1.0;
            var crashAt = -1;
            var prev = null;
            for (var ci = 0; ci < n; ci++) {
              var tdeg = flightData.tilt ? flightData.tilt[ci] : 0;
              var cp = hasPos
                ? new THREE.Vector3(flightData.posX[ci], flightData.posZ[ci], -flightData.posY[ci])
                : null;
              var jumped = prev && cp && cp.distanceTo(prev) > CRASH_JUMP_M;
              if ((tdeg && tdeg >= CRASH_TILT_DEG) || jumped) { crashAt = ci; break; }
              prev = cp;
            }
            var lastGood = crashAt < 0 ? n : crashAt;

            for (var i = 0; i < lastGood; i++) {
              var yawDeg = flightData.yaw && flightData.yaw[i] ? flightData.yaw[i] : 0;
              var p3d;
              if (hasPos) {
                p3d = new THREE.Vector3(flightData.posX[i], flightData.posZ[i], -flightData.posY[i]);
              } else {
                // No recorded position. Keep it at the origin rather than
                // inventing a path: a flight drawn from a guess is worse than a
                // flight drawn as a dot, because it looks convincing.
                p3d = new THREE.Vector3(0, 0.5, 0);
              }

              var s = {
                front: flightData.frontSensor ? flightData.frontSensor[i] : 0,
                back:  flightData.backSensor  ? flightData.backSensor[i]  : 0,
                left:  flightData.leftSensor  ? flightData.leftSensor[i]  : 0,
                right: flightData.rightSensor ? flightData.rightSensor[i] : 0,
                up:    flightData.TopSensor   ? flightData.TopSensor[i]   : 0,
                down:  flightData.downSensor  ? flightData.downSensor[i]  : 0
              };
              addSample(p3d, yawDeg, s, flightData.time[i]);

              // The WALLS. Only the four horizontal sensors contribute: up is
              // the ceiling and down is the floor, and including them buried the
              // room under a curtain of points at two fixed heights.
              var dirs = rayDirs(yawDeg * Math.PI / 180);
              ['front', 'back', 'left', 'right'].forEach(function (k) {
                var v = s[k];
                if (v > 0 && v < 15.0) {
                  var e = p3d.clone().add(dirs[k].clone().multiplyScalar(v));
                  wallPts.push(e.x, e.y, e.z);
                  var c = new THREE.Color(colors[k]);
                  wallCols.push(c.r, c.g, c.b);
                }
              });
            }

            // A marker where it ended, so a crash is a place rather than an
            // absence. Red is the BACK sensor's colour elsewhere, which is why
            // this is drawn as a ring rather than a dot -- it is not a reading.
            if (crashAt > 0 && pathPoints.length) {
              var where = pathPoints[pathPoints.length - 1];
              var ring = new THREE.Mesh(
                new THREE.TorusGeometry(0.16, 0.022, 8, 24),
                new THREE.MeshBasicMaterial({ color: 0xe5484d }));
              ring.position.copy(where);
              ring.rotation.x = Math.PI / 2;
              scene.add(ring);

              var note = document.getElementById('scale');
              if (note) {
                note.innerHTML = 'grid square = 1 m<br/>' +
                  '<span style="color:#e5484d">lost control at ' +
                  (flightData.time && flightData.time[crashAt] != null
                    ? Number(flightData.time[crashAt]).toFixed(0) + 's'
                    : 'sample ' + crashAt) +
                  '</span><br/><span style="color:#7D8C9A">' +
                  (n - crashAt) + ' later samples not drawn</span>';
              }
            }

            if (wallPts.length) {
              var wg = new THREE.BufferGeometry();
              wg.setAttribute('position', new THREE.Float32BufferAttribute(wallPts, 3));
              wg.setAttribute('color', new THREE.Float32BufferAttribute(wallCols, 3));
              scene.add(new THREE.Points(wg, new THREE.PointsMaterial({
                size: 0.06, vertexColors: true, transparent: true, opacity: 0.85
              })));
            }

            if (pathPoints.length > 1) {
              pathLine = new THREE.Line(
                new THREE.BufferGeometry().setFromPoints(pathPoints),
                new THREE.LineBasicMaterial({ color: 0xE8EDF2 }));
              scene.add(pathLine);
            }

            // Frame the flight rather than a fixed distance, with a 1.5m floor
            // so a hover is not zoomed in until ordinary drift fills the screen
            // and looks like wild flying.
            //
            // A flight whose FIRST sample already looks like a crash leaves
            // nothing to frame: Box3 over no points has its min at +infinity,
            // the centre comes out NaN, and a camera at NaN renders nothing at
            // all -- a blank screen with no clue why.
            if (!pathPoints.length) {
              camera.position.set(4, 4, 4);
              controls.target.set(0, 0, 0);
              var warn = document.getElementById('scale');
              if (warn) {
                warn.innerHTML = '<span style="color:#e5484d">nothing to draw<br/>' +
                  'this flight was already out of control at its first sample</span>';
              }
            } else {
            var box = new THREE.Box3().setFromPoints(pathPoints);
            var centre = box.getCenter(new THREE.Vector3());
            var size = box.getSize(new THREE.Vector3());
            var extent = Math.max(size.x, size.y, size.z, 1.5);
            controls.target.copy(centre);
            camera.position.set(centre.x + extent * 1.5,
                                centre.y + extent * 1.1 + 1.0,
                                centre.z + extent * 1.5);
            camera.lookAt(centre);
            }
          } else {
            camera.position.set(4, 4, 4);
            controls.target.set(0, 0, 0);
            var e = document.createElement('div');
            e.id = 'empty';
            e.textContent = 'no flight loaded';
            document.body.appendChild(e);
          }

          // --- the readout ----------------------------------------------------
          //
          // Numbers AND a bar, because six numbers in a column do not tell you
          // at a glance that the left wall is half as far as the right one. Each
          // bar is drawn as a fraction of the longest reading in that sample, so
          // the six are directly comparable.
          var sensorsEl = document.getElementById('sensors');
          var rowEls = {};
          ORDER.forEach(function (k) {
            var row = document.createElement('div');
            row.className = 'row';
            row.innerHTML =
              '<span class="sw" style="background:' + cssColors[k] + '"></span>' +
              '<span class="nm">' + k.toUpperCase() + '</span>' +
              '<span class="vl"></span>' +
              '<span class="bar" style="background:' + cssColors[k] + '"></span>';
            sensorsEl.appendChild(row);
            rowEls[k] = { val: row.children[2], bar: row.children[3] };
          });

          var MAX_BAR_PX = 54;

          function showSample(idx) {
            if (!samples.length) return;
            if (idx < 0) idx = 0;
            if (idx >= samples.length) idx = samples.length - 1;
            var sm = samples[idx];

            droneMesh.position.copy(sm.p);
            // Scene yaw turns the opposite way to the drone's, because the Y
            // axis was negated to un-mirror the scene.
            droneMesh.rotation.y = -sm.yaw * Math.PI / 180;

            while (liveRays.children.length) liveRays.remove(liveRays.children[0]);
            var dirs = rayDirs(sm.yaw * Math.PI / 180);

            var longest = 0;
            ORDER.forEach(function (k) {
              var v = sm.s[k];
              if (v > 0 && v < 15.0 && v > longest) longest = v;
            });
            if (longest <= 0) longest = 1;

            ORDER.forEach(function (k) {
              var v = sm.s[k];
              var el = rowEls[k];
              if (v > 0 && v < 15.0) {
                el.val.textContent = Math.round(v * 1000) + 'mm';
                el.bar.style.width = Math.max(2, Math.round(MAX_BAR_PX * v / longest)) + 'px';
                el.bar.style.opacity = '0.85';

                var end = sm.p.clone().add(dirs[k].clone().multiplyScalar(v));
                liveRays.add(new THREE.Line(
                  new THREE.BufferGeometry().setFromPoints([sm.p, end]),
                  new THREE.LineBasicMaterial({ color: colors[k] })));
                var dot = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 6),
                                         new THREE.MeshBasicMaterial({ color: colors[k] }));
                dot.position.copy(end);
                liveRays.add(dot);
              } else {
                // 0 means the laser saw nothing, which at these ranges means far
                // away, not touching. Saying so beats drawing a wall at zero.
                el.val.textContent = '--';
                el.bar.style.width = '0px';
                el.bar.style.opacity = '0.15';
              }
            });

            document.getElementById('t').textContent = (sm.t != null ? Number(sm.t).toFixed(1) : idx);
            document.getElementById('alt').textContent = Math.round(sm.p.y * 1000);
            document.getElementById('scrub').value = idx;
          }

          // --- playback -------------------------------------------------------
          var playing = false;
          var cursor = 0;
          var speed = 1;
          var lastTick = 0;
          var SAMPLE_MS = 1000;   // the drone records once a second

          var scrub = document.getElementById('scrub');
          var playBtn = document.getElementById('play');

          scrub.max = Math.max(0, samples.length - 1);
          scrub.addEventListener('input', function () {
            playing = false;
            playBtn.innerHTML = '&#9654;';
            cursor = parseInt(scrub.value, 10) || 0;
            showSample(cursor);
          });

          playBtn.addEventListener('click', function () {
            if (!samples.length) return;
            playing = !playing;
            // Starting from the end replays from the beginning, which is what
            // pressing play on a finished flight is asking for.
            if (playing && cursor >= samples.length - 1) cursor = 0;
            playBtn.innerHTML = playing ? '&#10073;&#10073;' : '&#9654;';
            lastTick = performance.now();
          });

          document.getElementById('spd').addEventListener('change', function (e) {
            speed = parseFloat(e.target.value) || 1;
          });

          function animate(now) {
            requestAnimationFrame(animate);

            if (playing && samples.length) {
              if (now - lastTick >= SAMPLE_MS / speed) {
                lastTick = now;
                cursor++;
                if (cursor >= samples.length) {
                  cursor = samples.length - 1;
                  playing = false;
                  playBtn.innerHTML = '&#9654;';
                }
                showSample(cursor);
              }
              // Spin the rotors only while playing, so a paused frame is
              // obviously paused.
              for (var r = 0; r < rotors.length; r++) rotors[r].rotation.y += 0.55;
            }

            controls.update();
            renderer.render(scene, camera);
          }

          showSample(0);
          requestAnimationFrame(animate);

          window.addEventListener('resize', function () {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
          });

          // --- live mode ------------------------------------------------------
          //
          // Same scene, fed a point at a time. Each arrival becomes a sample and
          // the view jumps to it, so live is simply playback pinned to the end.
          window.pushLivePoint = function (pt) {
            var p3d = new THREE.Vector3(pt.x, pt.z, -pt.y);
            addSample(p3d, pt.yaw, pt.sensors, samples.length);

            if (pathPoints.length > 1) {
              if (pathLine) scene.remove(pathLine);
              pathLine = new THREE.Line(
                new THREE.BufferGeometry().setFromPoints(pathPoints),
                new THREE.LineBasicMaterial({ color: 0xE8EDF2 }));
              scene.add(pathLine);
            }

            var el = document.getElementById('empty');
            if (el) el.remove();

            scrub.max = Math.max(0, samples.length - 1);
            cursor = samples.length - 1;
            showSample(cursor);
            controls.target.copy(p3d);
          };

        } catch (err) {
          document.body.innerHTML =
            '<div style="padding:16px;color:#e5484d;font-family:monospace;font-size:12px">' +
            '3D view failed to start<br/>' + String(err) + '</div>';
        }
      </script>
    </body>
    </html>
  `;

  const WebViewComponent = ({ webRef, onLoadEnd }: { webRef: React.RefObject<WebView | null>, onLoadEnd?: () => void }) => (
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
          setIsModalLoading(true);
          setIsFullscreen(true);
        }}>
          <Text style={styles.buttonText}>⛶ FULLSCREEN</Text>
        </TouchableOpacity>
      </View>

      <Modal visible={isFullscreen} animationType="slide" onRequestClose={() => setIsFullscreen(false)}>
        {/* edges: the close button used to sit at a fixed top:20 and Android
            drew it under the status bar, clipped. Letting the safe area own the
            top inset puts it below the clock on every device. */}
        <SafeAreaView style={styles.modalContainer} edges={['top', 'bottom']}>
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
    top: 10,
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
    top: 8,
    right: 12,
    backgroundColor: 'rgba(229, 72, 77, 0.92)',
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
