import React from 'react';
import Box from '@mui/material/Box';
import Link from '@mui/material/Link';

const links = [
  { label: 'Donate Data', href: '/donate-data' },
  { label: 'About & Contact', href: '/about' },
  { label: 'Data Sources', href: '/data-sources' },
  { label: 'Impressum', href: '/impressum' },
];

function Footer() {
  return (
    <Box
      sx={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: { xs: 1, sm: 2 },
        py: 1,
        px: 2,
        borderTop: '1px solid',
        borderColor: 'divider',
      }}
    >
      {links.map((link, i) => (
        <React.Fragment key={link.href}>
          {i > 0 && (
            <Box
              component="span"
              sx={{
                color: 'text.secondary',
                opacity: 0.3,
                fontSize: '0.7rem',
                display: { xs: 'none', sm: 'inline' },
              }}
            >
              |
            </Box>
          )}
          <Link
            href={link.href}
            target="_blank"
            rel="noopener noreferrer"
            underline="hover"
            sx={{
              color: 'text.secondary',
              fontSize: '0.7rem',
              opacity: 0.5,
              transition: 'opacity 0.3s ease',
              '&:hover': { opacity: 0.8 },
            }}
          >
            {link.label}
          </Link>
        </React.Fragment>
      ))}
    </Box>
  );
}

export default Footer;
