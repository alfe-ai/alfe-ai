#!/bin/bash

# ==== 0) Vars ====
GPU="0000:01:00.0"
AUDIO="0000:01:00.1"

# ==== 1) Remove vfio autoload/override sources ====
# a) Delete softdeps that prefer vfio
sudo rm -f /etc/modprobe.d/vfio-softdep.conf
sudo rm -f /etc/modprobe.d/nouveau-softdep.conf

# b) Purge vfio from initramfs modules (and any ids lines)
sudo sed -i '/^\s*vfio_pci ids=/d' /etc/initramfs-tools/modules
sudo sed -i '/^\s*vfio_pci\s*$/d'    /etc/initramfs-tools/modules
sudo sed -i '/^\s*vfio_iommu_type1/d' /etc/initramfs-tools/modules
sudo sed -i '/^\s*vfio\s*$/d'         /etc/initramfs-tools/modules

# c) Kill the systemd service that re-binds to vfio
sudo systemctl disable --now bind-3090-vfio.service || true
sudo rm -f /etc/systemd/system/bind-3090-vfio.service
sudo rm -f /etc/systemd/system/graphical.target.wants/bind-3090-vfio.service
sudo rm -f /usr/local/bin/bind-3090-vfio.sh
sudo systemctl daemon-reload

# ==== 2) Make sure the NVIDIA-override rule is early (wins races) ====
# Rename 71- to 05- so it runs before anything else
if [ -f /etc/udev/rules.d/71-nvidia-override.rules ]; then
  sudo mv /etc/udev/rules.d/71-nvidia-override.rules /etc/udev/rules.d/05-nvidia-override.rules
fi
sudo udevadm control --reload
sudo udevadm trigger

# ==== 3) Rebuild early boot images and GRUB ====
sudo update-initramfs -u
sudo update-grub

# ==== 4) Kick vfio off the devices NOW and bind to NVIDIA (no reboot needed) ====
# Clear any driver_override first
echo "" | sudo tee /sys/bus/pci/devices/$GPU/driver_override
echo "" | sudo tee /sys/bus/pci/devices/$AUDIO/driver_override

# Unbind from vfio if attached
echo "$GPU"   | sudo tee /sys/bus/pci/drivers/vfio-pci/unbind 2>/dev/null
echo "$AUDIO" | sudo tee /sys/bus/pci/drivers/vfio-pci/unbind 2>/dev/null

# Make sure vfio modules aren’t loaded/binding anything
sudo modprobe -r vfio_pci vfio_iommu_type1 vfio 2>/dev/null || true

# Load NVIDIA stack
sudo modprobe nvidia
sudo modprobe nvidia_modeset
sudo modprobe nvidia_uvm
sudo modprobe nvidia_drm

# Bind to NVIDIA
echo nvidia | sudo tee /sys/bus/pci/devices/$GPU/driver_override
echo nvidia | sudo tee /sys/bus/pci/devices/$AUDIO/driver_override
echo "$GPU"   | sudo tee /sys/bus/pci/drivers/nvidia/bind
echo "$AUDIO" | sudo tee /sys/bus/pci/drivers/nvidia/bind

# ==== 5) Verify ====
echo "---- VERIFY ----"
lspci -k -s 01:00.0
lspci -k -s 01:00.1
nvidia-smi -L

