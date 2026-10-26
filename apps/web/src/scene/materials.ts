import * as THREE from 'three'

/* Vật liệu dùng chung cho mọi tầng — tránh tạo mới mỗi lần render. */
export const MAT = {
  wall: new THREE.MeshStandardMaterial({ color: '#f1ede6', roughness: 0.92 }),
  wallTop: new THREE.MeshStandardMaterial({ color: '#d9d2c7', roughness: 0.9 }),
  slab: new THREE.MeshStandardMaterial({ color: '#d8d2c8', roughness: 1 }),
  ceiling: new THREE.MeshStandardMaterial({ color: '#f6f5f2', roughness: 0.95 }),
  glass: new THREE.MeshStandardMaterial({ color: '#bcd8e6', transparent: true, opacity: 0.28, roughness: 0.05, metalness: 0.2, depthWrite: false }),
  frame: new THREE.MeshStandardMaterial({ color: '#3a3836', roughness: 0.5 }),
  door: new THREE.MeshStandardMaterial({ color: '#b08a62', roughness: 0.6 }),
  stair: new THREE.MeshStandardMaterial({ color: '#cbb89c', roughness: 0.7 }),
  water: new THREE.MeshStandardMaterial({ color: '#4aa3c7', roughness: 0.1, metalness: 0.1, transparent: true, opacity: 0.85 }),
  poolEdge: new THREE.MeshStandardMaterial({ color: '#e9e5dc', roughness: 0.8 }),
  grass: new THREE.MeshStandardMaterial({ color: '#8cad6e', roughness: 1 }),
  paving: new THREE.MeshStandardMaterial({ color: '#cfc8bb', roughness: 1 }),
  deck: new THREE.MeshStandardMaterial({ color: '#b9926a', roughness: 0.8 }),
  ground: new THREE.MeshStandardMaterial({ color: '#dcd6cc', roughness: 1 }),
  groundNight: new THREE.MeshStandardMaterial({ color: '#2a2e38', roughness: 1 }),
}
