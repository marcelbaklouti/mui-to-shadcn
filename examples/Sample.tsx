import * as React from "react";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  AlertTitle,
  Avatar,
  Button as MuiButton,
  Card,
  CardActions,
  CardContent,
  CardHeader,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Divider,
  IconButton,
  LinearProgress,
  Link,
  MenuItem,
  Paper,
  Select,
  Skeleton,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tabs,
  Tab,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import Box from "@mui/material/Box";
import SaveIcon from "@mui/icons-material/Save";
import DeleteIcon from "@mui/icons-material/Delete";

interface SampleProps {
  loading: boolean;
  checked: boolean;
  onToggle: (value: boolean) => void;
  active: boolean;
  open: boolean;
  onClose: () => void;
  tab: string;
  onTab: (value: string) => void;
  country: string;
  onCountry: (value: string) => void;
}

export function Sample({ loading, checked, onToggle, active, open, onClose, tab, onTab, country, onCountry }: SampleProps) {
  return (
    <Box sx={{ p: 2 }}>
      <Typography variant="h4" gutterBottom>
        Konto
      </Typography>
      <Typography variant="body2" color="text.secondary">
        Verwalte deine Einstellungen
      </Typography>

      <Stack direction="row" spacing={2} sx={{ mt: 2, alignItems: "center" }}>
        <Card elevation={3} className="mt-4">
          <CardHeader title="Profil" subheader="Persoenliche Daten" />
          <CardContent>
            <Avatar src="/user.png" alt="Nutzer">
              MB
            </Avatar>
            <Divider className="my-2" />
            <Checkbox checked={checked} onChange={(e) => onToggle(e.target.checked)} color="primary" />
            <Switch checked={active} onChange={onToggle} size="small" />
            <Chip label="Neu" color="error" variant="outlined" />
            <Link href="/help" underline="hover">
              Hilfe
            </Link>
          </CardContent>
          <CardActions>
            <Tooltip title="Speichern" placement="top">
              <MuiButton variant="contained" color="primary" fullWidth startIcon={<SaveIcon />}>
                Speichern
              </MuiButton>
            </Tooltip>
            <IconButton color="primary" size="small">
              <DeleteIcon />
            </IconButton>
          </CardActions>
        </Card>
      </Stack>

      {loading ? (
        <Skeleton variant="rectangular" width={210} height={118} />
      ) : (
        <LinearProgress value={60} variant="determinate" />
      )}

      <Paper elevation={1} square>
        <Alert severity="error">
          <AlertTitle>Fehler</AlertTitle>
          Etwas ist schiefgelaufen
        </Alert>
      </Paper>

      <Tabs value={tab} onChange={onTab}>
        <Tab label="Allgemein" value="general" />
        <Tab label="Sicherheit" value="security" />
      </Tabs>

      <Accordion>
        <AccordionSummary>Mehr Details</AccordionSummary>
        <AccordionDetails>
          <Typography variant="body2">Versteckter Inhalt</Typography>
        </AccordionDetails>
      </Accordion>

      <Table>
        <TableHead>
          <TableRow>
            <TableCell>Name</TableCell>
            <TableCell align="right">Betrag</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          <TableRow>
            <TableCell>Abo</TableCell>
            <TableCell align="right">9,99</TableCell>
          </TableRow>
        </TableBody>
      </Table>

      <TextField label="Name" value="" />
      <Select value={country} onChange={onCountry} label="Land">
        <MenuItem value="de">Deutschland</MenuItem>
        <MenuItem value="at">Oesterreich</MenuItem>
      </Select>

      <Dialog open={open} onClose={onClose}>
        <DialogTitle>Loeschen</DialogTitle>
        <DialogContent>
          <DialogContentText>Wirklich loeschen?</DialogContentText>
        </DialogContent>
        <DialogActions>
          <MuiButton onClick={onClose}>Abbrechen</MuiButton>
          <MuiButton variant="contained" color="error">
            Loeschen
          </MuiButton>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
