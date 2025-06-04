# Violet Visual Gallery

A modern, interactive image gallery application built with Astro and React. This application allows users to view, manage, and interact with images in a beautiful and intuitive interface.

## Features

- 📸 Interactive image gallery with grid and list views
- 🔍 Fullscreen image viewing with zoom capabilities
- ✂️ Image cropping functionality
- 📝 Image caption editing
- 🎨 Modern, responsive design
- ⚡ Fast performance with Astro's partial hydration
- 🖼️ Support for various image formats

## Project Structure

```text
/
├── public/           # Static assets
├── src/
│   ├── assets/      # Project assets
│   ├── components/  # React and Astro components
│   │   ├── Gallery.astro        # Main gallery component
│   │   ├── GalleryReact.tsx     # React gallery implementation
│   │   ├── FullscreenModal.astro # Fullscreen image viewer
│   │   ├── CropModal.astro      # Image cropping interface
│   │   ├── CaptionModal.astro   # Caption editing interface
│   │   ├── Drawer.astro         # Navigation drawer
│   │   ├── Image.astro          # Image component
│   │   └── Welcome.astro        # Welcome screen
│   ├── layouts/     # Page layouts
│   ├── pages/       # Application pages
│   ├── styles/      # Global styles
│   ├── types/       # TypeScript type definitions
│   └── utils/       # Utility functions
└── package.json
```

## Getting Started

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the development server:
   ```bash
   npm run dev
   ```
4. Open [http://localhost:4321](http://localhost:4321) in your browser

## Available Scripts

| Command                   | Action                                           |
| :------------------------ | :----------------------------------------------- |
| `npm install`             | Installs dependencies                            |
| `npm run dev`             | Starts local dev server at `localhost:4321`      |
| `npm run build`           | Build your production site to `./dist/`          |
| `npm run preview`         | Preview your build locally, before deploying     |

## Gallery Features

### Image Viewing
[Image of gallery view]

- Grid and list view options
- Responsive layout
- Smooth image loading
- Thumbnail previews

### Fullscreen Mode
[Image of fullscreen view]

- Zoom in/out functionality
- Pan and drag support
- Navigation between images
- Image information display

### Image Editing
[Image of editing interface]

- Crop images to desired dimensions
- Add and edit image captions
- Save changes to image metadata

## Technologies Used

- [Astro](https://astro.build) - Static site generation
- [React](https://reactjs.org) - Interactive components
- [TypeScript](https://www.typescriptlang.org) - Type safety
- [TailwindCSS](https://tailwindcss.com) - Styling

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the LICENSE file for details.
