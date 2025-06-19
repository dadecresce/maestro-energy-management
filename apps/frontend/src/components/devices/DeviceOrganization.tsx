import { useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Chip,
  Grid,
  IconButton,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Divider,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Home as HomeIcon,
  Room as RoomIcon,
  Group as GroupIcon,
} from '@mui/icons-material';
import type { Device } from '@maestro/shared';

interface Room {
  id: string;
  name: string;
  icon: string;
  description?: string;
  deviceIds: string[];
}

interface DeviceGroup {
  id: string;
  name: string;
  color: string;
  deviceIds: string[];
}

interface DeviceOrganizationProps {
  devices: Device[];
  onDeviceUpdate?: (deviceId: string, updates: Partial<Device>) => void;
}

const DEFAULT_ROOMS: Room[] = [
  { id: 'living-room', name: 'Living Room', icon: '🛋️', deviceIds: [] },
  { id: 'kitchen', name: 'Kitchen', icon: '🍳', deviceIds: [] },
  { id: 'bedroom', name: 'Bedroom', icon: '🛏️', deviceIds: [] },
  { id: 'bathroom', name: 'Bathroom', icon: '🚿', deviceIds: [] },
  { id: 'office', name: 'Office', icon: '💻', deviceIds: [] },
  { id: 'garage', name: 'Garage', icon: '🚗', deviceIds: [] },
];

const DEFAULT_GROUPS: DeviceGroup[] = [
  { id: 'lights', name: 'Lights', color: '#FFD700', deviceIds: [] },
  { id: 'appliances', name: 'Appliances', color: '#FF6B6B', deviceIds: [] },
  { id: 'security', name: 'Security', color: '#4ECDC4', deviceIds: [] },
  { id: 'climate', name: 'Climate', color: '#45B7D1', deviceIds: [] },
];

const DeviceOrganization = ({ devices, onDeviceUpdate }: DeviceOrganizationProps) => {
  const [rooms, setRooms] = useState<Room[]>(DEFAULT_ROOMS);
  const [groups, setGroups] = useState<DeviceGroup[]>(DEFAULT_GROUPS);
  const [roomDialog, setRoomDialog] = useState<{ open: boolean; room?: Room }>({ open: false });
  const [groupDialog, setGroupDialog] = useState<{ open: boolean; group?: DeviceGroup }>({ open: false });
  const [assignDialog, setAssignDialog] = useState<{ 
    open: boolean; 
    device?: Device; 
    type: 'room' | 'group';
  }>({ open: false, type: 'room' });

  const unassignedDevices = devices.filter(device => 
    !rooms.some(room => room.deviceIds.includes(device._id)) &&
    !groups.some(group => group.deviceIds.includes(device._id))
  );

  const handleAssignDevice = (deviceId: string, targetId: string, type: 'room' | 'group') => {
    if (type === 'room') {
      setRooms(prev => prev.map(room => 
        room.id === targetId 
          ? { ...room, deviceIds: [...room.deviceIds, deviceId] }
          : { ...room, deviceIds: room.deviceIds.filter(id => id !== deviceId) }
      ));
    } else {
      setGroups(prev => prev.map(group => 
        group.id === targetId 
          ? { ...group, deviceIds: [...group.deviceIds, deviceId] }
          : { ...group, deviceIds: group.deviceIds.filter(id => id !== deviceId) }
      ));
    }
    
    setAssignDialog({ open: false, type: 'room' });
  };

  const handleRemoveFromRoom = (deviceId: string, roomId: string) => {
    setRooms(prev => prev.map(room => 
      room.id === roomId 
        ? { ...room, deviceIds: room.deviceIds.filter(id => id !== deviceId) }
        : room
    ));
  };

  const handleRemoveFromGroup = (deviceId: string, groupId: string) => {
    setGroups(prev => prev.map(group => 
      group.id === groupId 
        ? { ...group, deviceIds: group.deviceIds.filter(id => id !== deviceId) }
        : group
    ));
  };

  const getDeviceById = (deviceId: string) => devices.find(d => d._id === deviceId);

  const AssignDeviceDialog = () => (
    <Dialog 
      open={assignDialog.open} 
      onClose={() => setAssignDialog({ open: false, type: 'room' })}
      maxWidth="sm"
      fullWidth
    >
      <DialogTitle>
        Assign Device to {assignDialog.type === 'room' ? 'Room' : 'Group'}
      </DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" gutterBottom>
          Select a {assignDialog.type} for: {assignDialog.device?.name}
        </Typography>
        
        <List>
          {(assignDialog.type === 'room' ? rooms : groups).map((item) => (
            <ListItem
              key={item.id}
              button
              onClick={() => handleAssignDevice(
                assignDialog.device!._id, 
                item.id, 
                assignDialog.type
              )}
            >
              <ListItemText
                primary={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    {assignDialog.type === 'room' ? (
                      <span style={{ fontSize: '1.2em' }}>{(item as Room).icon}</span>
                    ) : (
                      <Box 
                        sx={{ 
                          width: 16, 
                          height: 16, 
                          borderRadius: '50%', 
                          backgroundColor: (item as DeviceGroup).color 
                        }} 
                      />
                    )}
                    {item.name}
                  </Box>
                }
                secondary={`${item.deviceIds.length} device(s)`}
              />
            </ListItem>
          ))}
        </List>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => setAssignDialog({ open: false, type: 'room' })}>
          Cancel
        </Button>
      </DialogActions>
    </Dialog>
  );

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h5" sx={{ fontWeight: 500 }}>
          Device Organization
        </Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant="outlined"
            startIcon={<RoomIcon />}
            onClick={() => setRoomDialog({ open: true })}
            size="small"
          >
            Add Room
          </Button>
          <Button
            variant="outlined"
            startIcon={<GroupIcon />}
            onClick={() => setGroupDialog({ open: true })}
            size="small"
          >
            Add Group
          </Button>
        </Box>
      </Box>

      <Grid container spacing={3}>
        {/* Rooms Section */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <HomeIcon />
                Rooms
              </Typography>
              
              {rooms.map((room) => (
                <Box key={room.id} sx={{ mb: 2 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                    <Typography variant="subtitle1" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <span style={{ fontSize: '1.2em' }}>{room.icon}</span>
                      {room.name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {room.deviceIds.length} device(s)
                    </Typography>
                  </Box>
                  
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                    {room.deviceIds.map((deviceId) => {
                      const device = getDeviceById(deviceId);
                      return device ? (
                        <Chip
                          key={deviceId}
                          label={device.name}
                          size="small"
                          onDelete={() => handleRemoveFromRoom(deviceId, room.id)}
                          color={device.isOnline ? 'primary' : 'default'}
                        />
                      ) : null;
                    })}
                  </Box>
                  
                  {room !== rooms[rooms.length - 1] && <Divider sx={{ mt: 2 }} />}
                </Box>
              ))}
            </CardContent>
          </Card>
        </Grid>

        {/* Groups Section */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <GroupIcon />
                Groups
              </Typography>
              
              {groups.map((group) => (
                <Box key={group.id} sx={{ mb: 2 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                    <Typography variant="subtitle1" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Box 
                        sx={{ 
                          width: 16, 
                          height: 16, 
                          borderRadius: '50%', 
                          backgroundColor: group.color 
                        }} 
                      />
                      {group.name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {group.deviceIds.length} device(s)
                    </Typography>
                  </Box>
                  
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                    {group.deviceIds.map((deviceId) => {
                      const device = getDeviceById(deviceId);
                      return device ? (
                        <Chip
                          key={deviceId}
                          label={device.name}
                          size="small"
                          onDelete={() => handleRemoveFromGroup(deviceId, group.id)}
                          style={{ backgroundColor: group.color + '20', color: group.color }}
                        />
                      ) : null;
                    })}
                  </Box>
                  
                  {group !== groups[groups.length - 1] && <Divider sx={{ mt: 2 }} />}
                </Box>
              ))}
            </CardContent>
          </Card>
        </Grid>

        {/* Unassigned Devices */}
        {unassignedDevices.length > 0 && (
          <Grid item xs={12}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Unassigned Devices
                </Typography>
                
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                  {unassignedDevices.map((device) => (
                    <Box key={device._id} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Chip
                        label={device.name}
                        color={device.isOnline ? 'primary' : 'default'}
                      />
                      <Button
                        size="small"
                        onClick={() => setAssignDialog({ open: true, device, type: 'room' })}
                      >
                        Assign to Room
                      </Button>
                      <Button
                        size="small"
                        onClick={() => setAssignDialog({ open: true, device, type: 'group' })}
                      >
                        Assign to Group
                      </Button>
                    </Box>
                  ))}
                </Box>
              </CardContent>
            </Card>
          </Grid>
        )}
      </Grid>

      <AssignDeviceDialog />
    </Box>
  );
};

export default DeviceOrganization;