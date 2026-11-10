/* Avgarde product 3D models.
   buildProductModel() and its procedural textures come from the Avgarde 3D product suite
   (Pictures/products/avgarde_3d_product_pages_suite), unchanged. Requires three.js r128 (global THREE). */
(() => {
"use strict";

  const TEXTURE_CACHE = {};

  function getTechArmorBumpTexture() {
    if (TEXTURE_CACHE.armorBump) return TEXTURE_CACHE.armorBump;
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext("2d");

    ctx.fillStyle = "#808080";
    ctx.fillRect(0, 0, 512, 512);

    // Fine tactical powder-coat micro-grain noise
    const imgData = ctx.getImageData(0, 0, 512, 512);
    const d = imgData.data;
    let seed = 1337;
    for (let i = 0; i < d.length; i += 4) {
      seed = (seed * 16807) % 2147483647;
      const n = ((seed & 255) - 128) * 0.14;
      const val = Math.max(0, Math.min(255, 128 + n));
      d[i] = d[i + 1] = d[i + 2] = val;
      d[i + 3] = 255;
    }
    ctx.putImageData(imgData, 0, 0);

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    TEXTURE_CACHE.armorBump = tex;
    return tex;
  }

  function getMachinedRidgeBumpTexture(stripes) {
    const key = "ridge_" + (stripes || 32);
    if (TEXTURE_CACHE[key]) return TEXTURE_CACHE[key];
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext("2d");
    const count = stripes || 32;
    const step = 512 / count;
    for (let i = 0; i < count; i++) {
      const y = i * step;
      const grad = ctx.createLinearGradient(0, y, 0, y + step);
      grad.addColorStop(0.0, "#202020");
      grad.addColorStop(0.25, "#e8e8e8");
      grad.addColorStop(0.75, "#d0d0d0");
      grad.addColorStop(1.0, "#181818");
      ctx.fillStyle = grad;
      ctx.fillRect(0, y, 512, step);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    TEXTURE_CACHE[key] = tex;
    return tex;
  }

  function getKnurledBumpTexture() {
    if (TEXTURE_CACHE.knurl) return TEXTURE_CACHE.knurl;
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#505050";
    ctx.fillRect(0, 0, 256, 256);
    ctx.strokeStyle = "#e0e0e0";
    ctx.lineWidth = 3;
    for (let i = -256; i < 512; i += 12) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i + 256, 256);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(i + 256, 0);
      ctx.lineTo(i, 256);
      ctx.stroke();
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    TEXTURE_CACHE.knurl = tex;
    return tex;
  }

  // Transparent decal generator so there is NEVER a mismatched background patch or border box
  function createTransparentAvgardeDecal(width, height, textHex, isEmbossed) {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 160;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.font = "900 78px 'Inter', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    if (isEmbossed) {
      // Subtle dark drop shadow + raised sage highlight for embossed look on DroneDRISHTI
      ctx.fillStyle = "#1c241f";
      ctx.fillText("AVGARDE", 259, 83);
      ctx.fillStyle = textHex || "#90a898";
      ctx.fillText("AVGARDE", 256, 80);
    } else {
      ctx.fillStyle = textHex || "#00b8ff";
      ctx.fillText("AVGARDE", 256, 80);
      // Signal bars inside V
      ctx.fillStyle = "#84cc16";
      ctx.fillRect(130, 32, 20, 6);
      ctx.fillRect(133, 42, 14, 5);
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    const mat = new THREE.MeshStandardMaterial({
      map: tex,
      transparent: true,
      roughness: 0.35,
      metalness: 0.25,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2
    });
    return new THREE.Mesh(new THREE.PlaneGeometry(width, height), mat);
  }

  // =========================================================================
  // 3. HIGH-DETAIL THREE.JS 3D HARDWARE MODELS (CLEAN GEOMETRY, NO OCCLUSIONS)
  // =========================================================================
  function addPart(group, mesh) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  }

  function buildHexBoltRow(count, spanX, y, z, radius, mat) {
    const g = new THREE.Group();
    for (let i = 0; i < count; i++) {
      const x = count === 1 ? 0 : -spanX / 2 + (i / (count - 1)) * spanX;
      const b = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 0.024, 6), mat);
      b.rotation.x = Math.PI / 2;
      b.position.set(x, y, z);
      g.add(b);
    }
    return g;
  }

  // Hollow open-square box-frame trunnion for DroneDOOT
  function buildOpenTrunnionFrame(widthX, heightY, depthZ, barThick, mat) {
    const frame = new THREE.Group();
    const hw = widthX / 2 - barThick / 2;
    const hh = heightY / 2 - barThick / 2;
    const hd = depthZ / 2 - barThick / 2;

    [[-hw, -hd], [hw, -hd], [-hw, hd], [hw, hd]].forEach(([px, pz]) => {
      const post = new THREE.Mesh(new THREE.BoxGeometry(barThick, heightY, barThick), mat);
      post.position.set(px, 0, pz);
      frame.add(post);
    });
    [[-hh, -hd], [hh, -hd], [-hh, hd], [hh, hd]].forEach(([py, pz]) => {
      const barX = new THREE.Mesh(new THREE.BoxGeometry(widthX - barThick * 2, barThick, barThick), mat);
      barX.position.set(0, py, pz);
      frame.add(barX);
    });
    [[-hw, -hh], [hw, -hh], [-hw, hh], [hw, hh]].forEach(([px, py]) => {
      const barZ = new THREE.Mesh(new THREE.BoxGeometry(barThick, barThick, depthZ - barThick * 2), mat);
      barZ.position.set(px, py, 0);
      frame.add(barZ);
    });
    return frame;
  }

  function buildProductModel(productId) {
    const root = new THREE.Group();

    const armorBump = getTechArmorBumpTexture();
    const ridgeBump = getMachinedRidgeBumpTexture(36);
    const knurlBump = getKnurledBumpTexture();

    const matOlive = new THREE.MeshStandardMaterial({
      color: 0x29420e,
      roughness: 0.44,
      metalness: 0.28,
      bumpMap: armorBump,
      bumpScale: 0.016
    });
    const matOliveDark = new THREE.MeshStandardMaterial({
      color: 0x1e3209,
      roughness: 0.48,
      metalness: 0.30,
      bumpMap: armorBump,
      bumpScale: 0.018
    });
    const matOliveRidged = new THREE.MeshStandardMaterial({
      color: 0x263e0d,
      roughness: 0.40,
      metalness: 0.34,
      bumpMap: ridgeBump,
      bumpScale: 0.032
    });
    const matBlackTech = new THREE.MeshStandardMaterial({
      color: 0x0b1108,
      roughness: 0.36,
      metalness: 0.50
    });
    const matSilver = new THREE.MeshStandardMaterial({
      color: 0xe4eef5,
      roughness: 0.18,
      metalness: 0.88,
      bumpMap: armorBump,
      bumpScale: 0.006
    });
    const matSilverInner = new THREE.MeshStandardMaterial({
      color: 0x8ea0ad,
      roughness: 0.32,
      metalness: 0.78
    });
    const matKnurledSilver = new THREE.MeshStandardMaterial({
      color: 0xcbd5e1,
      roughness: 0.28,
      metalness: 0.85,
      bumpMap: knurlBump,
      bumpScale: 0.032
    });
    const matAluminum = new THREE.MeshStandardMaterial({
      color: 0x9aa5b1,
      roughness: 0.28,
      metalness: 0.82,
      bumpMap: ridgeBump,
      bumpScale: 0.028
    });
    const matGold = new THREE.MeshStandardMaterial({
      color: 0xfacc15,
      roughness: 0.22,
      metalness: 0.85,
      bumpMap: knurlBump,
      bumpScale: 0.025
    });
    const matBluePort = new THREE.MeshStandardMaterial({
      color: 0x2563eb,
      roughness: 0.28,
      metalness: 0.65,
      bumpMap: knurlBump,
      bumpScale: 0.025
    });

    if (productId === "dronedoot") {
      // =====================================================================
      // 1. DRONEDOOT™ — HORIZONTAL PANEL, ZERO OCCLUSIONS, CLEAN GEOMETRY
      // =====================================================================
      const pedW = 1.50, pedH = 1.56, pedD = 1.50;
      const pedY = -0.64; // Extends from y = -1.42 to y = +0.14
      const pedestal = new THREE.Mesh(new THREE.BoxGeometry(pedW, pedH, pedD), matOliveDark);
      pedestal.position.set(0, pedY, 0);
      addPart(root, pedestal);

      // Clean Top Cap Plate sitting strictly above pedestal (y = 0.14 to y = 0.19)
      const topCapLip = new THREE.Mesh(new THREE.BoxGeometry(pedW + 0.06, 0.05, pedD + 0.06), matOlive);
      topCapLip.position.set(0, 0.165, 0);
      addPart(root, topCapLip);

      // Clean Bottom Plinth sitting strictly below pedestal (y = -1.42 to y = -1.46)
      const botPlinth = new THREE.Mesh(new THREE.BoxGeometry(pedW - 0.04, 0.04, pedD - 0.04), matBlackTech);
      botPlinth.position.set(0, -1.44, 0);
      addPart(root, botPlinth);

      // Helper for clean non-overlapping panel outline & perimeter bolts
      function buildCleanAccessDoor(w, h) {
        const dg = new THREE.Group();
        // Single raised door plate (thickness 0.016, centered at z = 0.008)
        const doorPlate = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.016), matOlive);
        doorPlate.position.set(0, 0, 0.008);
        dg.add(doorPlate);

        // Perimeter bolts sitting cleanly at z = 0.018
        const r = 0.016;
        for (let i = 0; i < 4; i++) {
          const bx = -w / 2 + 0.06 + (i / 3) * (w - 0.12);
          [-h / 2 + 0.05, h / 2 - 0.05].forEach((by) => {
            const bolt = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.01, 10), matBlackTech);
            bolt.rotation.x = Math.PI / 2;
            bolt.position.set(bx, by, 0.018);
            dg.add(bolt);
          });
        }
        for (let j = 1; j < 5; j++) {
          const by = -h / 2 + 0.05 + (j / 5) * (h - 0.10);
          [-w / 2 + 0.06, w / 2 - 0.06].forEach((bx) => {
            const bolt = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.01, 10), matBlackTech);
            bolt.rotation.x = Math.PI / 2;
            bolt.position.set(bx, by, 0.018);
            dg.add(bolt);
          });
        }
        return dg;
      }

      // Front-Right (+Z) and Rear-Left (-Z) Cabinet Faces
      [1, -1].forEach((zSign) => {
        const faceGroup = new THREE.Group();

        if (zSign === 1) {
          // Transparent vertical cyan AVGARDE decal on left margin (no rectangle patch!)
          const vDecal = createTransparentAvgardeDecal(0.76, 0.20, "#00b8ff", false);
          vDecal.position.set(-0.56, -0.22, 0.006);
          vDecal.rotation.z = Math.PI / 2;
          faceGroup.add(vDecal);
        }

        const pW = 0.92, pH = 1.24;
        const pX = zSign === 1 ? 0.10 : 0.0;
        const door = buildCleanAccessDoor(pW, pH);
        door.position.set(pX, 0, 0);
        faceGroup.add(door);

        // 2 columns of 7 clean horizontal louver bars sitting strictly in front of doorPlate (z = 0.020)
        for (let r = -3; r <= 3; r++) {
          [-0.20, 0.20].forEach((cOff) => {
            const slot = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.036, 0.008), matBlackTech);
            slot.position.set(pX + cOff, r * 0.125, 0.018);
            faceGroup.add(slot);

            const hoodBar = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.018, 0.016), matOliveDark);
            hoodBar.position.set(pX + cOff, r * 0.125 + 0.014, 0.022);
            faceGroup.add(hoodBar);
          });
        }

        faceGroup.position.set(0, pedY, zSign * (pedD / 2));
        if (zSign === -1) faceGroup.rotation.y = Math.PI;
        addPart(root, faceGroup);
      });

      // Front-Left (-X) and Rear-Right (+X) Cabinet Faces
      [-1, 1].forEach((xSign) => {
        const sideGroup = new THREE.Group();
        const pW = 1.02, pH = 1.24;
        const door = buildCleanAccessDoor(pW, pH);
        sideGroup.add(door);

        // 2 columns of 7 dark ventilation slots sitting cleanly at z = 0.018
        for (let r = -3; r <= 3; r++) {
          [-0.23, 0.23].forEach((cOff) => {
            const slot = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.038, 0.008), matBlackTech);
            slot.position.set(cOff, r * 0.125 - 0.04, 0.018);
            sideGroup.add(slot);
          });
        }

        // 4 narrow horizontal diagnostic slots near top center
        for (let ms = 0; ms < 4; ms++) {
          const miniSlot = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.020, 0.008), matBlackTech);
          miniSlot.position.set(0, 0.44 - ms * 0.045, 0.018);
          sideGroup.add(miniSlot);
        }

        sideGroup.position.set(xSign * (pedW / 2), pedY, 0);
        sideGroup.rotation.y = xSign === -1 ? -Math.PI / 2 : Math.PI / 2;
        addPart(root, sideGroup);
      });

      // 2. Cylindrical Azimuth Turntable Neck (y = 0.19 to y = 0.35, zero overlap with cabinet cap or carrier bed)
      const turntable = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.50, 0.16, 32), matBlackTech);
      turntable.position.set(0, 0.27, 0);
      addPart(root, turntable);

      // 3. HORIZONTAL Upper Carrier Bed & Radar Panel Assembly (Strictly Horizontal: rotation.z = 0, rotation.x = 0)
      const upperAssembly = new THREE.Group();
      upperAssembly.position.set(0, 0.35, 0);

      const bedLen = 3.10;
      // Horizontal Olive-Green Carrier Bed Rails (y = 0.07, so bottom is at y = 0.35, resting cleanly on turntable)
      [-0.19, 0.19].forEach((zRail) => {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(bedLen, 0.12, 0.08), matOlive);
        rail.position.set(0, 0.06, zRail);
        upperAssembly.add(rail);
      });
      [-1.38, -0.69, 0.0, 0.69, 1.38].forEach((xBulk) => {
        const cross = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.12, 0.30), matOliveDark);
        cross.position.set(xBulk, 0.06, 0);
        upperAssembly.add(cross);
      });
      const bedFloor = new THREE.Mesh(new THREE.BoxGeometry(bedLen - 0.16, 0.03, 0.30), matBlackTech);
      bedFloor.position.set(0, 0.02, 0);
      upperAssembly.add(bedFloor);

      // Clean Front Visor Shelf attached strictly to the front rail (z = +0.23 to +0.52), clearing the turntable completely
      const visorPlate = new THREE.Mesh(new THREE.BoxGeometry(1.90, 0.04, 0.32), matOliveDark);
      visorPlate.position.set(0, 0.01, 0.37);
      visorPlate.rotation.x = 0.32;
      upperAssembly.add(visorPlate);

      // Left (-X) and Right (+X) Hollow Box-Frame End Trunnions (x = -1.69 and +1.69, zero overlap with bed rails)
      [-1.69, 1.69].forEach((xEnd, idx) => {
        const trunnion = buildOpenTrunnionFrame(0.28, 0.42, 0.44, 0.05, matOlive);
        trunnion.position.set(xEnd, 0.15, 0);
        upperAssembly.add(trunnion);

        // Vertical support bracket connecting trunnion to the horizontal radar panel
        const riserPost = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.32, 0.14), matOliveDark);
        riserPost.position.set(xEnd + (idx === 0 ? 0.11 : -0.11), 0.42, 0);
        upperAssembly.add(riserPost);
      });

      // 4. Horizontally Level 4-Bay Metallic Silver Slotted Waveguide Radar Array
      const radarTruss = new THREE.Group();
      radarTruss.position.set(0, 0.52, 0);
      // Pitched slightly in elevation around its horizontal X-axis, while staying 100% horizontal left-to-right (rotation.z = 0)
      radarTruss.rotation.x = -0.36;

      const arrLen = 2.94;
      const arrH = 0.74;
      const arrD = 0.22;

      // Top and Bottom Long Horizontal Silver Beams (no overlapping inner boxes)
      [arrH / 2 - 0.055, -arrH / 2 + 0.055].forEach((yBeam, bIdx) => {
        const mainBeam = new THREE.Mesh(new THREE.BoxGeometry(arrLen, 0.11, arrD), matSilver);
        mainBeam.position.set(0, yBeam, 0);
        radarTruss.add(mainBeam);

        // 8 Clean Waveguide Slots along the top/bottom edge (placed cleanly outside the beam surface by 0.004)
        [-1.22, -0.88, -0.52, -0.18, 0.18, 0.52, 0.88, 1.22].forEach((sx) => {
          const wSlot = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.012, 0.10), matBlackTech);
          wSlot.position.set(sx, yBeam + (bIdx === 0 ? 0.058 : -0.058), 0);
          radarTruss.add(wSlot);
        });
      });

      // 5 Vertical Cross-Struts spanning strictly between the top and bottom beams (height = arrH - 0.22, zero overlap!)
      const innerStrutH = arrH - 0.22;
      [-1.41, -0.705, 0.0, 0.705, 1.41].forEach((xStrut, sIdx) => {
        const isEnd = sIdx === 0 || sIdx === 4;
        const sW = isEnd ? 0.12 : 0.095;

        const strutBody = new THREE.Mesh(new THREE.BoxGeometry(sW, innerStrutH, arrD), matSilver);
        strutBody.position.set(xStrut, 0, 0);
        radarTruss.add(strutBody);

        // Recessed dark channel strip on front and back of strut (offset cleanly by +0.003)
        [-1, 1].forEach((zSide) => {
          const chStrip = new THREE.Mesh(new THREE.BoxGeometry(sW * 0.48, innerStrutH - 0.06, 0.008), matSilverInner);
          chStrip.position.set(xStrut, 0, zSide * (arrD / 2 + 0.002));
          radarTruss.add(chStrip);
        });
      });

      upperAssembly.add(radarTruss);
      addPart(root, upperAssembly);

    } else if (productId === "dronesense") {
      // =====================================================================
      // 2. DRONESENSE™ — SMALLER AVGARDE LOGO ON TOP OF FANS ONTO THE LEFT
      // =====================================================================
      const assembly = new THREE.Group();
      assembly.rotation.z = -0.58;

      // 1. Clean Olive-Green Receiver Chassis (Solid olive, no full-face stretched texture!)
      const rxBox = new THREE.Mesh(new THREE.BoxGeometry(1.78, 0.74, 0.74), matOlive);
      rxBox.position.set(-0.85, 0, 0);
      addPart(assembly, rxBox);

      // Smaller, crisp transparent AVGARDE logo placed on top of the fans onto the left (clear of ports and fans!)
      const senseLogoDecal = createTransparentAvgardeDecal(0.64, 0.16, "#00b8ff", false);
      senseLogoDecal.position.set(-0.98, 0.19, 0.374);
      assembly.add(senseLogoDecal);

      // Longitudinal CNC Structural Ridges along Top & Bottom of Receiver Chassis
      [-0.38, 0.38].forEach((ySide) => {
        for (let r = -2; r <= 2; r++) {
          const ridge = new THREE.Mesh(new THREE.BoxGeometry(1.74, 0.03, 0.04), matOliveDark);
          ridge.position.set(-0.85, ySide, r * 0.14);
          addPart(assembly, ridge);
        }
      });

      // Bolted End-Cap Flanges on Left & Right of Receiver Box
      [-1.75, 0.05].forEach((xCap) => {
        const capRim = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.78, 0.78), matBlackTech);
        capRim.position.set(xCap, 0, 0);
        addPart(assembly, capRim);
      });

      // Secondary Finned Filter Sub-Box underneath (y = -0.55, strictly below rxBox bottom at -0.37)
      const subBox = new THREE.Mesh(new THREE.BoxGeometry(0.60, 0.32, 0.56), matOliveDark);
      subBox.position.set(-0.72, -0.53, 0);
      addPart(assembly, subBox);
      for (let f = -5; f <= 5; f++) {
        const sFin = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.33, 0.58), matBlackTech);
        sFin.position.set(-0.72 + f * 0.05, -0.53, 0);
        addPart(assembly, sFin);
      }

      // Dual Turbine Cooling Fan Module on lower-center of front face (y = -0.15, strictly inside rxBox lower half)
      const fanHousing = new THREE.Group();
      const fanPlate = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.38, 0.02), matAluminum);
      fanHousing.add(fanPlate);
      [-0.095, 0.095].forEach((yOff) => {
        const shroud = new THREE.Mesh(new THREE.CylinderGeometry(0.082, 0.082, 0.03, 24), matBlackTech);
        shroud.rotation.x = Math.PI / 2;
        shroud.position.set(0, yOff, 0.012);
        fanHousing.add(shroud);
        const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.038, 16), matSilver);
        hub.rotation.x = Math.PI / 2;
        hub.position.set(0, yOff, 0.015);
        fanHousing.add(hub);
      });
      fanHousing.position.set(-0.78, -0.15, 0.375);
      addPart(assembly, fanHousing);

      // Multi-Port Coaxial Bulkhead at far left end (x = -1.56 and -1.38)
      const ioPositions = [
        [-1.56, 0.06, 0.375, matBluePort],
        [-1.56, -0.14, 0.375, matBluePort],
        [-1.38, 0.06, 0.375, matGold],
        [-1.38, -0.14, 0.375, matGold]
      ];
      ioPositions.forEach(([x, y, z, colMat]) => {
        const flange = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.02), matSilver);
        flange.position.set(x, y, z);
        addPart(assembly, flange);
        const port = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.10, 20), colMat);
        port.rotation.x = Math.PI / 2;
        port.position.set(x, y, z + 0.045);
        addPart(assembly, port);
        const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.115, 12), matSilver);
        pin.rotation.x = Math.PI / 2;
        pin.position.set(x, y, z + 0.05);
        addPart(assembly, pin);
      });

      // 2. Central Cylindrical Olive Mast with Coaxial Clamps
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.05, 24), matOliveRidged);
      mast.rotation.z = Math.PI / 2;
      mast.position.set(0.45, 0, 0);
      addPart(assembly, mast);

      [0.22, 0.68].forEach((mx) => {
        const clamp = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.08, 16), matBlackTech);
        clamp.rotation.z = Math.PI / 2;
        clamp.position.set(mx, 0, 0);
        addPart(assembly, clamp);
      });

      // 3. Radial Finned Olive Collar Cup & White Fiberglass Radome
      const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.39, 0.36, 0.30, 32), matOliveDark);
      collar.rotation.z = Math.PI / 2;
      collar.position.set(1.02, 0, 0);
      addPart(assembly, collar);

      for (let k = 0; k < 12; k++) {
        const ang = (k / 12) * Math.PI * 2;
        const cFin = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.03, 0.05), matOlive);
        cFin.position.set(1.02, Math.cos(ang) * 0.38, Math.sin(ang) * 0.38);
        cFin.rotation.x = -ang;
        addPart(assembly, cFin);
      }

      const collarRim = new THREE.Mesh(new THREE.CylinderGeometry(0.43, 0.43, 0.045, 32), matSilver);
      collarRim.rotation.z = Math.PI / 2;
      collarRim.position.set(1.17, 0, 0);
      addPart(assembly, collarRim);

      const matWhiteRadome = new THREE.MeshStandardMaterial({
        color: 0xeaeff2,
        roughness: 0.22,
        metalness: 0.15,
        bumpMap: armorBump,
        bumpScale: 0.008
      });
      const radCyl = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 1.34, 36), matWhiteRadome);
      radCyl.rotation.z = Math.PI / 2;
      radCyl.position.set(1.84, 0, 0);
      addPart(assembly, radCyl);

      [1.45, 1.85, 2.25].forEach((rx) => {
        const seam = new THREE.Mesh(new THREE.TorusGeometry(0.382, 0.008, 12, 36), matSilver);
        seam.rotation.y = Math.PI / 2;
        seam.position.set(rx, 0, 0);
        addPart(assembly, seam);
      });

      const radCap = new THREE.Mesh(new THREE.SphereGeometry(0.38, 36, 20), matWhiteRadome);
      radCap.position.set(2.50, 0, 0);
      addPart(assembly, radCap);

      root.add(assembly);

    } else if (productId === "droneyug") {
      // =====================================================================
      // 5. DRONEYUG™ — CENTERED AVGARDE ONLY (NO DRONEYUG EW TEXT OR BORDER)
      // =====================================================================
      const yugGroup = new THREE.Group();
      yugGroup.rotation.z = 0.42;
      yugGroup.rotation.x = 0.28;

      const coreBox = new THREE.Mesh(new THREE.BoxGeometry(2.36, 1.36, 1.12), matOlive);
      addPart(yugGroup, coreBox);

      // Centered transparent AVGARDE decal on front face (no DRONEYUG EW text, no border box!)
      const yugLogoDecal = createTransparentAvgardeDecal(1.28, 0.34, "#28b8ff", false);
      yugLogoDecal.position.set(0, 0, 0.564);
      yugGroup.add(yugLogoDecal);

      yugGroup.add(buildHexBoltRow(6, 2.1, 0.62, 0.565, 0.022, matSilver));
      yugGroup.add(buildHexBoltRow(6, 2.1, -0.62, 0.565, 0.022, matSilver));

      // 6 Multi-Tiered Flanged Coaxial RF Ports (3 Upper, 3 Lower)
      [-0.78, 0.0, 0.78].forEach((xPos) => {
        [-0.46, 0.46].forEach((yPos) => {
          const flange = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.24, 0.045), matOliveDark);
          flange.position.set(xPos, yPos, 0.58);
          yugGroup.add(flange);

          [[-0.08, -0.08], [0.08, -0.08], [-0.08, 0.08], [0.08, 0.08]].forEach(([bx, by]) => {
            const fb = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.06, 6), matSilver);
            fb.rotation.x = Math.PI / 2;
            fb.position.set(xPos + bx, yPos + by, 0.585);
            yugGroup.add(fb);
          });

          const hexNut = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.07, 6), matOlive);
          hexNut.rotation.x = Math.PI / 2;
          hexNut.position.set(xPos, yPos, 0.62);
          yugGroup.add(hexNut);

          const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.068, 0.24, 24), matOliveRidged);
          barrel.rotation.x = Math.PI / 2;
          barrel.position.set(xPos, yPos, 0.70);
          yugGroup.add(barrel);

          const outerRing = new THREE.Mesh(new THREE.CylinderGeometry(0.046, 0.046, 0.26, 20), matKnurledSilver);
          outerRing.rotation.x = Math.PI / 2;
          outerRing.position.set(xPos, yPos, 0.71);
          yugGroup.add(outerRing);

          const goldPin = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.28, 12), matGold);
          goldPin.rotation.x = Math.PI / 2;
          goldPin.position.set(xPos, yPos, 0.72);
          yugGroup.add(goldPin);
        });
      });

      // 34 Deep 3D Longitudinal Heatsink Cooling Ridges on Bottom Face (strictly below coreBox at y <= -0.68)
      for (let f = 0; f < 34; f++) {
        const rib = new THREE.Mesh(new THREE.BoxGeometry(2.34, 0.24, 0.018), matBlackTech);
        rib.position.set(0, -0.80, -0.52 + f * (1.04 / 33));
        yugGroup.add(rib);
      }

      // 26 Deep 3D Transverse Heatsink Cooling Ridges on Right Side Face (strictly right of coreBox at x >= 1.18)
      for (let f = 0; f < 26; f++) {
        const rib = new THREE.Mesh(new THREE.BoxGeometry(0.24, 1.34, 0.020), matBlackTech);
        rib.position.set(1.30, 0, -0.52 + f * (1.04 / 25));
        yugGroup.add(rib);
      }

      root.add(yugGroup);

    } else if (productId === "dronearm") {
      const gunGroup = new THREE.Group();
      gunGroup.rotation.y = -0.35;
      gunGroup.rotation.z = -0.15;

      const muzzleGroup = new THREE.Group();
      const muzzleBox = new THREE.Mesh(new THREE.BoxGeometry(1.58, 1.10, 0.70), matOlive);
      muzzleBox.position.set(1.12, 0.02, 0);
      muzzleGroup.add(muzzleBox);

      [-0.36, 0.36].forEach((zSide) => {
        const armorPlate = new THREE.Mesh(new THREE.BoxGeometry(1.36, 0.84, 0.025), matOliveRidged);
        armorPlate.position.set(1.12, 0.02, zSide);
        muzzleGroup.add(armorPlate);
      });

      const frontFace = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.96, 0.58), matBlackTech);
      frontFace.position.set(1.92, 0.02, 0);
      muzzleGroup.add(frontFace);
      for (let r = -3; r <= 3; r++) {
        const fBar = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.035, 0.54), matOliveDark);
        fBar.position.set(1.94, 0.02 + r * 0.12, 0);
        muzzleGroup.add(fBar);
      }

      for (let i = 0; i < 14; i++) {
        [-0.16, 0.16].forEach((zOff) => {
          const ventTop = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.03, 0.22), matBlackTech);
          ventTop.position.set(0.45 + i * 0.095, 0.58, zOff);
          muzzleGroup.add(ventTop);
        });
      }
      addPart(gunGroup, muzzleGroup);

      const receiverGroup = new THREE.Group();
      const recBox = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.88, 0.52), matOliveDark);
      recBox.position.set(-0.28, 0.12, 0);
      receiverGroup.add(recBox);

      [-0.266, 0.266].forEach((zSide) => {
        const recess = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.66, 0.012), matBlackTech);
        recess.position.set(-0.28, 0.12, zSide);
        receiverGroup.add(recess);
        for (let r = -8; r <= 8; r++) {
          const slat = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.020, 0.024), matOliveRidged);
          slat.position.set(-0.28, 0.12 + r * 0.036, zSide + (zSide > 0 ? 0.008 : -0.008));
          receiverGroup.add(slat);
        }
      });

      const frontSight = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.22, 0.10), matOlive);
      frontSight.position.set(-0.74, 0.64, 0);
      receiverGroup.add(frontSight);
      const sightDot = new THREE.Mesh(new THREE.SphereGeometry(0.02, 12, 12), new THREE.MeshBasicMaterial({ color: 0x4ade80 }));
      sightDot.position.set(-0.78, 0.72, 0);
      receiverGroup.add(sightDot);
      addPart(gunGroup, receiverGroup);

      const stockBox = new THREE.Mesh(new THREE.BoxGeometry(1.08, 0.54, 0.46), matOlive);
      stockBox.position.set(-1.44, 0.28, 0);
      addPart(gunGroup, stockBox);

      const cheekRidge = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.05, 0.47), matOliveDark);
      cheekRidge.position.set(-1.42, 0.575, 0);
      addPart(gunGroup, cheekRidge);

      const buttPad = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.54, 0.46), matBlackTech);
      buttPad.position.set(-2.015, 0.28, 0);
      addPart(gunGroup, buttPad);
      for (let b = -4; b <= 4; b++) {
        const bRidge = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.028, 0.46), matBlackTech);
        bRidge.position.set(-2.06, 0.28 + b * 0.055, 0);
        addPart(gunGroup, bRidge);
      }

      const gripGroup = new THREE.Group();
      const matGrip = new THREE.MeshStandardMaterial({
        color: 0x161414,
        roughness: 0.55,
        metalness: 0.2,
        bumpMap: knurlBump,
        bumpScale: 0.045
      });
      const grip = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.64, 0.24), matGrip);
      grip.position.set(-0.62, -0.52, 0);
      grip.rotation.z = -0.42;
      gripGroup.add(grip);

      for (let fg = 0; fg < 4; fg++) {
        const fRidge = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.24, 14), matGrip);
        fRidge.rotation.x = Math.PI / 2;
        fRidge.position.set(-0.48 - fg * 0.05, -0.36 - fg * 0.11, 0);
        gripGroup.add(fRidge);
      }

      const trigGuard = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.14, 0.08), matOliveDark);
      trigGuard.position.set(-0.36, -0.38, 0);
      gripGroup.add(trigGuard);

      const trigger = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.025, 0.14, 12), matSilver);
      trigger.position.set(-0.38, -0.34, 0);
      trigger.rotation.z = 0.25;
      gripGroup.add(trigger);
      addPart(gunGroup, gripGroup);

      const scopeGroup = new THREE.Group();
      const riser = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.15, 0.13), matSilver);
      riser.position.set(-0.18, 0.64, 0);
      scopeGroup.add(riser);

      for (let p = -7; p <= 7; p++) {
        const picRidge = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.03, 0.135), matKnurledSilver);
        picRidge.position.set(-0.18 + p * 0.044, 0.73, 0);
        scopeGroup.add(picRidge);
      }

      const matBronzeScope = new THREE.MeshStandardMaterial({
        color: 0x524741,
        roughness: 0.24,
        metalness: 0.82,
        bumpMap: armorBump,
        bumpScale: 0.012
      });
      const scopeTube = new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.068, 1.56, 28), matBronzeScope);
      scopeTube.rotation.z = Math.PI / 2;
      scopeTube.position.set(-0.12, 0.84, 0);
      scopeGroup.add(scopeTube);

      [-0.36, 0.02].forEach((rx) => {
        const ringMount = new THREE.Mesh(new THREE.CylinderGeometry(0.088, 0.088, 0.09, 24), matBlackTech);
        ringMount.rotation.z = Math.PI / 2;
        ringMount.position.set(rx, 0.84, 0);
        scopeGroup.add(ringMount);
      });

      const topTurret = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.08, 20), matKnurledSilver);
      topTurret.position.set(-0.16, 0.93, 0);
      scopeGroup.add(topTurret);

      const sideTurret = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.08, 20), matKnurledSilver);
      sideTurret.rotation.x = Math.PI / 2;
      sideTurret.position.set(-0.16, 0.84, 0.09);
      scopeGroup.add(sideTurret);

      const objBell = new THREE.Mesh(new THREE.CylinderGeometry(0.118, 0.068, 0.36, 28), matBronzeScope);
      objBell.rotation.z = Math.PI / 2;
      objBell.position.set(0.54, 0.84, 0);
      scopeGroup.add(objBell);

      const objLens = new THREE.Mesh(
        new THREE.CircleGeometry(0.108, 24),
        new THREE.MeshStandardMaterial({ color: 0x00d8a0, roughness: 0.08, metalness: 0.9 })
      );
      objLens.rotation.y = Math.PI / 2;
      objLens.position.set(0.722, 0.84, 0);
      scopeGroup.add(objLens);

      const eyeBell = new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.10, 0.30, 28), matBronzeScope);
      eyeBell.rotation.z = Math.PI / 2;
      eyeBell.position.set(-0.78, 0.84, 0);
      scopeGroup.add(eyeBell);

      addPart(gunGroup, scopeGroup);
      root.add(gunGroup);

    } else if (productId === "dronewall") {
      // =====================================================================
      // 4. DRONEWALL™ / DIWAR™ — CENTERED AVGARDE TEXT ON TOP OF DRONEWALL
      // =====================================================================
      const wallGroup = new THREE.Group();

      // 1. Satin Dark Olive-Black EMI-Shielded Top Cover with Centered AVGARDE Logo
      const matTopDark = new THREE.MeshStandardMaterial({
        color: 0x131b0b,
        roughness: 0.22,
        metalness: 0.55,
        bumpMap: armorBump,
        bumpScale: 0.014
      });
      const topLid = new THREE.Mesh(new THREE.BoxGeometry(2.36, 0.09, 1.96), matTopDark);
      topLid.position.set(0, 0.29, 0);
      addPart(wallGroup, topLid);

      // Centered AVGARDE logo on top of DroneWALL
      const wallTopDecal = createTransparentAvgardeDecal(1.32, 0.36, "#00b8ff", false);
      wallTopDecal.rotation.x = -Math.PI / 2;
      wallTopDecal.position.set(0, 0.338, 0);
      wallGroup.add(wallTopDecal);

      // 2. Anodized Metallic Olive-Green Mid-Chassis
      const matAnodizedOlive = new THREE.MeshStandardMaterial({
        color: 0x3b5818,
        roughness: 0.32,
        metalness: 0.60,
        bumpMap: armorBump,
        bumpScale: 0.018
      });
      const midChassis = new THREE.Mesh(new THREE.BoxGeometry(2.36, 0.39, 1.96), matAnodizedOlive);
      midChassis.position.set(0, 0.05, 0);
      addPart(wallGroup, midChassis);

      // 3. Front Panel: 5 Knurled Silver N-Type Coaxial RF Ports (433MHz, 900MHz, GNSS, 2.4GHz, 5.8GHz)
      [-0.86, -0.50, -0.14, 0.22, 0.58].forEach((xPos) => {
        const flange = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.20, 0.04), matAnodizedOlive);
        flange.position.set(xPos, 0.04, 0.99);
        wallGroup.add(flange);

        [[-0.07, -0.07], [0.07, -0.07], [-0.07, 0.07], [0.07, 0.07]].forEach(([bx, by]) => {
          const b = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.05, 6), matSilver);
          b.rotation.x = Math.PI / 2;
          b.position.set(xPos + bx, 0.04 + by, 0.995);
          wallGroup.add(b);
        });

        const hexNut = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.06, 6), matSilver);
        hexNut.rotation.x = Math.PI / 2;
        hexNut.position.set(xPos, 0.04, 1.03);
        wallGroup.add(hexNut);

        const coax = new THREE.Mesh(new THREE.CylinderGeometry(0.066, 0.066, 0.19, 24), matKnurledSilver);
        coax.rotation.x = Math.PI / 2;
        coax.position.set(xPos, 0.04, 1.09);
        wallGroup.add(coax);

        const dielectric = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.20, 16), matBlackTech);
        dielectric.rotation.x = Math.PI / 2;
        dielectric.position.set(xPos, 0.04, 1.095);
        wallGroup.add(dielectric);

        const centerPin = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.21, 12), matGold);
        centerPin.rotation.x = Math.PI / 2;
        centerPin.position.set(xPos, 0.04, 1.10);
        wallGroup.add(centerPin);
      });

      const blkPort = new THREE.Mesh(new THREE.CylinderGeometry(0.082, 0.082, 0.06, 24), matBlackTech);
      blkPort.rotation.x = Math.PI / 2;
      blkPort.position.set(0.95, 0.02, 0.99);
      wallGroup.add(blkPort);

      // 4. Right Side Wall: Recessed Slot with 5 Glowing Emerald LEDs & Guarded Silver Toggle Switch
      const slotRecess = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.13, 1.08), matBlackTech);
      slotRecess.position.set(1.175, 0.05, 0.15);
      wallGroup.add(slotRecess);

      const matGreenLed = new THREE.MeshBasicMaterial({ color: 0x4ade80 });
      [-0.25, -0.10, 0.05, 0.20, 0.35].forEach((zOff) => {
        const bezel = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.038, 0.02, 16), matSilver);
        bezel.rotation.z = Math.PI / 2;
        bezel.position.set(1.185, 0.05, 0.20 + zOff);
        wallGroup.add(bezel);

        const led = new THREE.Mesh(new THREE.SphereGeometry(0.024, 14, 14), matGreenLed);
        led.position.set(1.195, 0.05, 0.20 + zOff);
        wallGroup.add(led);
      });
      const toggleSw = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.09, 14), matSilver);
      toggleSw.rotation.z = Math.PI / 2;
      toggleSw.position.set(1.205, 0.05, -0.22);
      wallGroup.add(toggleSw);

      // 5. 26-Ridge CNC-Machined Brushed Aluminum Heatsink Baseplate
      const sinkPlate = new THREE.Mesh(new THREE.BoxGeometry(2.34, 0.09, 1.94), matAluminum);
      sinkPlate.position.set(0, -0.19, 0);
      wallGroup.add(sinkPlate);

      for (let i = -12; i <= 12; i++) {
        const fin = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.15, 1.92), matAluminum);
        fin.position.set(i * 0.09, -0.30, 0);
        wallGroup.add(fin);
      }
      root.add(wallGroup);

    } else if (productId === "dronedrishti") {
      // =====================================================================
      // 3. DRONEDRISHTI™ — ONLY "AVGARDE" CENTERED ON TOP (NO DRONEDRISHTI)
      // =====================================================================
      const drishtiGroup = new THREE.Group();

      const matSage = new THREE.MeshStandardMaterial({
        color: 0x46564b,
        roughness: 0.46,
        metalness: 0.24,
        bumpMap: armorBump,
        bumpScale: 0.020
      });
      const matSageRidged = new THREE.MeshStandardMaterial({
        color: 0x3d4b41,
        roughness: 0.42,
        metalness: 0.28,
        bumpMap: ridgeBump,
        bumpScale: 0.028
      });

      // Clean Main Aero-Polymer Body
      const mainSlab = new THREE.Mesh(new THREE.BoxGeometry(2.46, 0.56, 1.64), matSage);
      addPart(drishtiGroup, mainSlab);

      // Clean Stepped Perimeter Rim Ridges around Top Deck (no overlapping inner pads!)
      [-0.79, 0.79].forEach((zRim) => {
        const rimZ = new THREE.Mesh(new THREE.BoxGeometry(2.46, 0.04, 0.06), matSageRidged);
        rimZ.position.set(0, 0.30, zRim);
        drishtiGroup.add(rimZ);
      });
      [-1.20, 1.20].forEach((xRim) => {
        const rimX = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.04, 1.52), matSageRidged);
        rimX.position.set(xRim, 0.30, 0);
        drishtiGroup.add(rimX);
      });

      // Centered AVGARDE Text on Top (No DRONEDRISHTI text, completely unobstructed in center!)
      const drishtiTopLogo = createTransparentAvgardeDecal(1.26, 0.34, "#a3b8aa", true);
      drishtiTopLogo.rotation.x = -Math.PI / 2;
      drishtiTopLogo.position.set(0, 0.284, 0.08);
      drishtiGroup.add(drishtiTopLogo);

      // 3 Clean Diagnostic Indicator Grooves near top-right corner
      const ledCols = [0x4ade80, 0x38bdf8, 0xa855f7];
      [-0.58, -0.46, -0.34].forEach((zPos, idx) => {
        const groove = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.02, 0.036), matBlackTech);
        groove.position.set(0.76, 0.285, zPos);
        drishtiGroup.add(groove);

        const microLed = new THREE.Mesh(
          new THREE.BoxGeometry(0.07, 0.026, 0.022),
          new THREE.MeshBasicMaterial({ color: ledCols[idx] })
        );
        microLed.position.set(0.64, 0.288, zPos);
        drishtiGroup.add(microLed);
      });

      // Underside Anti-Vibration Structural Mounting Ridges (strictly below mainSlab at y = -0.30)
      for (let r = -5; r <= 5; r++) {
        const botRib = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.035, 1.56), matSageRidged);
        botRib.position.set(r * 0.20, -0.295, 0);
        drishtiGroup.add(botRib);
      }

      // Right Side Face USB-C Telemetry Port & Status LED Window
      const usbHole = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.11, 0.34), matBlackTech);
      usbHole.position.set(1.23, 0.02, -0.35);
      drishtiGroup.add(usbHole);

      const usbTongue = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.024, 0.22), matGold);
      usbTongue.position.set(1.235, 0.02, -0.35);
      drishtiGroup.add(usbTongue);

      const ledSlot = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.06, 0.12), matBlackTech);
      ledSlot.position.set(1.23, -0.06, 0.32);
      drishtiGroup.add(ledSlot);

      root.add(drishtiGroup);
    }

    return { root };
  }
  /* ---------------------------------------------------------------------------
     ProductViewer — themed wrapper around buildProductModel().
     Transparent canvas (the page supplies the stage background), drag to rotate,
     shift/right-drag to pan, ctrl/⌘ + wheel or pinch to zoom, smooth damping,
     auto-rotate, view presets, wireframe and hotspot focus. Renders only while
     on screen and the tab is visible.
     --------------------------------------------------------------------------- */
  const VIEW_DEFAULTS = {
    dronedoot:    { radius: 4.45, theta: -0.68, phi: 1.06 },
    dronesense:   { radius: 4.35, theta: 0.55, phi: 1.15 },
    droneyug:     { radius: 4.35, theta: 0.58, phi: 1.15 },
    dronearm:     { radius: 4.35, theta: 0.55, phi: 1.15 },
    dronewall:    { radius: 4.25, theta: -0.58, phi: 1.08 },
    dronedrishti: { radius: 4.15, theta: 0.58, phi: 1.05 },
  };

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  class ProductViewer {
    constructor(mount, productId, opts = {}) {
      this.mount = mount;
      this.id = productId;
      this.autoRotate = opts.autoRotate !== undefined ? opts.autoRotate : !reducedMotion;
      this.interactive = opts.interactive !== false;
      this.def = VIEW_DEFAULTS[productId] || { radius: 4.35, theta: 0.62, phi: 1.15 };
      this.shaderMode = 'solid';
      this.visible = false;
      this.running = false;
      this.listeners = [];

      this.scene = new THREE.Scene();
      this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
      this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, opts.maxDpr || 2));
      this.renderer.setClearColor(0x000000, 0);
      this.renderer.outputEncoding = THREE.sRGBEncoding;

      // studio lighting from the suite, accents tuned to the site palette
      this.scene.add(new THREE.AmbientLight(0xffffff, 0.9));
      const key = new THREE.DirectionalLight(0xffffff, 1.65); key.position.set(5, 7, 6); this.scene.add(key);
      const fill = new THREE.DirectionalLight(0x38a0ff, 0.68); fill.position.set(-6, 3, -4); this.scene.add(fill);
      const rim = new THREE.DirectionalLight(0x2ee6d6, 0.5); rim.position.set(0, -6, 4); this.scene.add(rim);
      const back = new THREE.PointLight(0x38a0ff, 0.55, 12); back.position.set(0, 3.5, -3.5); this.scene.add(back);

      this.modelRoot = buildProductModel(productId).root;
      this.scene.add(this.modelRoot);

      // the suite authored colours as sRGB hex but rendered them as linear, which washes the
      // olive paint out to lime; convert once so the models match the real product photos
      this.modelRoot.traverse(o => {
        if (!o.isMesh) return;
        (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => {
          if (!m || m.userData.srgbFixed) return;
          if (m.color) m.color.convertSRGBToLinear();
          if (m.emissive) m.emissive.convertSRGBToLinear();
          if (m.map) { m.map.encoding = THREE.sRGBEncoding; m.map.needsUpdate = true; }
          m.userData.srgbFixed = true;
        });
      });

      // frame the model: orbit its bounding-sphere centre, and scale every camera distance so it
      // fits the stage (the suite's distances assumed a much wider viewport)
      const sphere = new THREE.Box3().setFromObject(this.modelRoot).getBoundingSphere(new THREE.Sphere());
      this.center = sphere.center.clone();
      this.fitR = sphere.radius;
      this.baseRadius = this.def.radius;
      this.scale = 1;

      this.spherical = { ...this.def };
      this.target = { ...this.def };
      this.pan = new THREE.Vector3();
      this.dragging = false;

      const canvas = this.renderer.domElement;
      canvas.setAttribute('aria-hidden', 'true');
      mount.appendChild(canvas);
      if (this.interactive) this._bindPointer(canvas);

      this.resize();
      this._ro = new ResizeObserver(() => this.resize());
      this._ro.observe(mount);
      this._io = new IntersectionObserver(([en]) => { this.visible = en.isIntersecting; this._kick(); }, { rootMargin: '100px' });
      this._io.observe(mount);
      this._on(document, 'visibilitychange', () => this._kick());
      this._frame = this._frame.bind(this);
      this.renderOnce();
      mount.classList.add('is-ready');
      const loading = mount.querySelector('.viewer__loading');
      if (loading) loading.remove();
    }

    _on(el, ev, fn, o) { el.addEventListener(ev, fn, o); this.listeners.push([el, ev, fn, o]); }

    _kick() {
      if (this.visible && !document.hidden && !this.running) { this.running = true; requestAnimationFrame(this._frame); }
    }

    _frame() {
      if (!this.visible || document.hidden) { this.running = false; return; }
      this.update();
      requestAnimationFrame(this._frame);
    }

    resize() {
      const w = Math.max(this.mount.clientWidth, 100), h = Math.max(this.mount.clientHeight, 100);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h, false);
      // distance at which the bounding sphere fits the narrower field of view
      const vFov = THREE.MathUtils.degToRad(this.camera.fov);
      const hFov = 2 * Math.atan(Math.tan(vFov / 2) * this.camera.aspect);
      const next = (this.fitR / Math.sin(Math.min(vFov, hFov) / 2)) * 0.95 / this.baseRadius;
      if (next !== this.scale) {
        const ratio = next / this.scale;
        this.spherical.radius *= ratio; this.target.radius *= ratio;
        this.scale = next;
      }
      this.renderOnce();
    }

    update() {
      if (this.autoRotate && !this.dragging) this.target.theta += 0.0045;
      const k = 0.12;
      this.spherical.theta += (this.target.theta - this.spherical.theta) * k;
      this.spherical.phi += (this.target.phi - this.spherical.phi) * k;
      this.spherical.radius += (this.target.radius - this.spherical.radius) * k;
      this.renderOnce();
    }

    renderOnce() {
      const { radius: r, theta, phi } = this.spherical, s = Math.sin(phi);
      const cx = this.center.x + this.pan.x, cy = this.center.y + this.pan.y, cz = this.center.z;
      this.camera.position.set(cx + r * s * Math.sin(theta), cy + r * Math.cos(phi), cz + r * s * Math.cos(theta));
      this.camera.lookAt(cx, cy, cz);
      this.renderer.render(this.scene, this.camera);
    }

    reset() { this.target = { ...this.def, radius: this.def.radius * this.scale }; this.pan.set(0, 0, 0); this.setShaderMode('solid'); }

    preset(name) {
      this.pan.set(0, 0, 0);
      const P = {
        iso: { ...this.def },
        front: { radius: this.def.radius, theta: 0, phi: Math.PI / 2 },
        side: { radius: this.def.radius, theta: Math.PI / 2, phi: Math.PI / 2 },
        top: { radius: this.def.radius, theta: 0, phi: 0.18 },
        back: { radius: this.def.radius, theta: Math.PI, phi: Math.PI / 2 },
      };
      if (!P[name]) return;
      // turn the shortest way round from the current angle
      const t = P[name];
      t.radius *= this.scale;
      const cur = this.target.theta, twoPi = Math.PI * 2;
      t.theta = cur + ((((t.theta - cur) % twoPi) + twoPi + Math.PI) % twoPi) - Math.PI;
      this.target = t;
    }

    focus([x, y, z]) {
      const r = Math.hypot(x, y, z) || 4;
      const phi = Math.acos(Math.max(-0.98, Math.min(0.98, y / r)));
      let theta = Math.atan2(x, z);
      const cur = this.target.theta, twoPi = Math.PI * 2;
      theta = cur + ((((theta - cur) % twoPi) + twoPi + Math.PI) % twoPi) - Math.PI;
      this.pan.set(0, 0, 0);
      this.target = { radius: Math.max(0.8, Math.min(1.15, r / 4.35)) * this.def.radius * this.scale, theta, phi };
    }

    zoomBy(d) { const b = this.def.radius * this.scale; this.target.radius = Math.max(b * 0.5, Math.min(b * 1.7, this.target.radius + d * this.scale)); }

    setShaderMode(mode) {
      this.shaderMode = mode;
      this.modelRoot.traverse(o => {
        if (!o.isMesh) return;
        (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => {
          if (!m) return;
          m.wireframe = mode === 'wireframe';
          m.transparent = mode === 'xray' || Boolean(m.map);
          m.opacity = mode === 'xray' ? 0.42 : 1;
        });
      });
      this.renderOnce();
    }

    _bindPointer(dom) {
      const pts = new Map();
      let last = null, pinch = 0, mode = 'rotate';
      this._on(dom, 'pointerdown', e => {
        pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
        dom.setPointerCapture(e.pointerId);
        this.dragging = true;
        mode = e.shiftKey || e.button === 2 ? 'pan' : 'rotate';
        last = { x: e.clientX, y: e.clientY };
        if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = Math.hypot(a.x - b.x, a.y - b.y); }
        this.mount.classList.add('is-grabbing');
      });
      this._on(dom, 'pointermove', e => {
        if (!pts.has(e.pointerId)) return;
        pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pts.size === 2) {
          const [a, b] = [...pts.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
          this.zoomBy((pinch - d) * 0.01); pinch = d; return;
        }
        const dx = e.clientX - last.x, dy = e.clientY - last.y;
        last = { x: e.clientX, y: e.clientY };
        if (mode === 'rotate') {
          this.target.theta -= dx * 0.011;
          this.target.phi = Math.max(0.15, Math.min(Math.PI - 0.15, this.target.phi - dy * 0.011));
          this.spherical.theta = this.target.theta;
          this.spherical.phi = this.target.phi;
        } else {
          this.pan.x -= dx * 0.004 * this.scale; this.pan.y += dy * 0.004 * this.scale;
        }
      });
      const end = e => {
        pts.delete(e.pointerId);
        if (!pts.size) { this.dragging = false; this.mount.classList.remove('is-grabbing'); }
      };
      this._on(dom, 'pointerup', end);
      this._on(dom, 'pointercancel', end);
      this._on(dom, 'contextmenu', e => e.preventDefault());
      // zoom with ctrl/⌘ + wheel (trackpad pinch also sends ctrlKey) so normal page scrolling is never hijacked
      this._on(dom, 'wheel', e => {
        if (!(e.ctrlKey || e.metaKey)) return;
        e.preventDefault();
        this.zoomBy(e.deltaY * 0.004);
      }, { passive: false });
    }

    dispose() {
      this.visible = false;
      this._ro.disconnect(); this._io.disconnect();
      this.listeners.forEach(([el, ev, fn, o]) => el.removeEventListener(ev, fn, o));
      this.modelRoot.traverse(o => {
        if (o.geometry) o.geometry.dispose();
        (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { if (m) { if (m.map) m.map.dispose(); m.dispose(); } });
      });
      this.renderer.dispose();
      this.renderer.domElement.remove();
    }
  }

  function webglOK() {
    try { const c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl') || c.getContext('experimental-webgl'))); }
    catch (e) { return false; }
  }

  /* ---------- auto-wire: <div class="viewer" data-model="dronedoot"> + controls ---------- */
  function init() {
    const stages = document.querySelectorAll('[data-model]');
    if (!stages.length) return;
    if (typeof THREE === 'undefined' || !webglOK()) {
      document.documentElement.classList.add('no-webgl');
      return;
    }
    stages.forEach(stage => {
      const id = stage.dataset.model;
      const mount = stage.querySelector('.viewer__canvas') || stage;
      let v;
      try { v = new ProductViewer(mount, id, { interactive: stage.dataset.interactive !== 'false', maxDpr: stage.dataset.maxDpr ? +stage.dataset.maxDpr : 2 }); }
      catch (err) { console.error(err); stage.classList.add('viewer--failed'); return; }
      stage.viewer = v;

      const scope = stage.closest('[data-viewer-scope]') || stage;
      const autoBtn = scope.querySelector('[data-viewer="autorotate"]');
      const syncAuto = () => { if (autoBtn) { autoBtn.setAttribute('aria-pressed', v.autoRotate); } };
      syncAuto();

      scope.addEventListener('click', e => {
        const b = e.target.closest('[data-viewer]');
        if (!b || !scope.contains(b)) return;
        const act = b.dataset.viewer;
        if (act === 'preset') {
          v.preset(b.dataset.preset);
          scope.querySelectorAll('[data-viewer="preset"]').forEach(x => x.setAttribute('aria-pressed', x === b));
        } else if (act === 'zoom-in') v.zoomBy(-0.55);
        else if (act === 'zoom-out') v.zoomBy(0.55);
        else if (act === 'reset') {
          v.reset();
          scope.querySelectorAll('[data-viewer="preset"]').forEach(x => x.setAttribute('aria-pressed', x.dataset.preset === 'iso'));
            scope.querySelectorAll('[data-viewer="focus"]').forEach(x => x.setAttribute('aria-pressed', false));
        }
        else if (act === 'autorotate') { v.autoRotate = !v.autoRotate; syncAuto(); }
        else if (act === 'focus') {
          v.focus(b.dataset.cam.split(',').map(Number));
          v.autoRotate = false; syncAuto();
          scope.querySelectorAll('[data-viewer="focus"]').forEach(x => x.setAttribute('aria-pressed', x === b));
          scope.querySelectorAll('[data-viewer="preset"]').forEach(x => x.setAttribute('aria-pressed', false));
        }
      });
    });
  }

  window.AvgardeModels = { ProductViewer, buildProductModel, init };
  // build after the page has painted — model construction takes a few hundred ms on the main thread
  const later = () => setTimeout(() => (window.requestIdleCallback ? requestIdleCallback(init, { timeout: 600 }) : init()), 50);
  if (document.readyState === 'complete') later(); else window.addEventListener('load', later, { once: true });
})();
